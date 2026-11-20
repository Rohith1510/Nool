import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { RtcTokenBuilder, RtcRole } from "agora-token";
import { agentConfiguration } from "../lib/voice/config";
import { hashToken, issueToolToken } from "../lib/voice/security";
import { summarizeAgentFailure } from "../lib/voice/diagnostics";
import type { Workspace, Evaluation } from "../lib/domain";
import puppeteer, { type Browser } from "puppeteer-core";
import { createRequire } from "node:module";
import { TranscriptDecoder } from "../lib/voice/transcripts";
import { readFileSync } from "node:fs";
loadEnvConfig(process.cwd());
async function main() {
  for (const key of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "NEXT_PUBLIC_AGORA_APP_ID",
    "AGORA_APP_CERTIFICATE",
    "AGORA_CUSTOMER_ID",
    "AGORA_CUSTOMER_SECRET",
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
    "MURF_API_KEY",
    "MURF_VOICE_ID",
    "MURF_LOCALE",
    "APP_URL",
    "AGORA_TOOL_SECRET",
  ])
    if (!process.env[key])
      throw new Error(`Configure ${key} before checking voice.`);
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  );
  const base = `https://api.agora.io/api/conversational-ai-agent/v2/projects/${process.env.NEXT_PUBLIC_AGORA_APP_ID}`;
  const headers = {
    Authorization: `Basic ${Buffer.from(`${process.env.AGORA_CUSTOMER_ID}:${process.env.AGORA_CUSTOMER_SECRET}`).toString("base64")}`,
    "Content-Type": "application/json",
  };
  const call = async (path: string, body?: unknown) => {
    const response = await fetch(base + path, {
      method: body ? "POST" : "GET",
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw new Error(
        `Agora ${path.endsWith("/join") ? "start" : "diagnostic"} returned HTTP ${response.status}.`,
      );
    return path.endsWith("/leave") ? {} : response.json();
  };
  let sessionId: string | undefined,
    agentId: string | undefined,
    browser: Browser | undefined;
  let reply = "",
    captureReply = false,
    replyFinal = false,
    greetingReceived = false;
  try {
    browser = await puppeteer.launch({
      executablePath:
        process.env.CHROME_PATH ||
        (process.platform === "win32"
          ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
          : "/usr/bin/google-chrome"),
      headless: true,
      args: ["--autoplay-policy=no-user-gesture-required"],
    });
    const page = await browser.newPage();
    await page.goto(new URL("/sign-in", process.env.APP_URL!).href, {
      waitUntil: "networkidle2",
    });
    const decoder = new TranscriptDecoder();
    await page.exposeFunction(
      "recordDiagnosticTranscript",
      (data: number[]) => {
        try {
          const message = decoder.decode(Uint8Array.from(data));
          if (!captureReply && message?.role === "assistant")
            greetingReceived = true;
          if (captureReply && message?.role === "assistant") {
            reply = message.text;
            replyFinal = message.final;
          }
        } catch {
          /* A malformed diagnostic packet cannot expose credentials. */
        }
      },
    );
    await page.addScriptTag({
      path: createRequire(import.meta.url).resolve("agora-rtc-sdk-ng"),
    });
    const { data: org, error: orgError } = await db
      .from("organizations")
      .select("id")
      .eq("is_sample", true)
      .limit(1)
      .single();
    if (orgError || !org)
      throw new Error(
        "Seed the labelled sample company first. This diagnostic never runs against a production organization.",
      );
    const { data: member, error: memberError } = await db
      .from("memberships")
      .select("user_id")
      .eq("organization_id", org.id)
      .eq("role", "merchandiser")
      .limit(1)
      .single();
    if (memberError || !member)
      throw new Error("Sample merchandiser membership not found.");
    const { data: snapshot, error: workspaceError } = await db.rpc(
      "workspace_snapshot",
      { p_org: org.id, p_actor: member.user_id },
    );
    if (workspaceError) throw new Error("Cannot read the sample workspace.");
    const w = snapshot as Workspace;
    const order = w.orders.find((o) => o.reference === "1042");
    if (!order) throw new Error("Sample order #1042 not found.");
    const id = randomUUID(),
      channel = `nool_check_${id.replaceAll("-", "")}`,
      expires = Math.floor(Date.now() / 1000) + 120;
    const credential = issueToolToken(
      id,
      expires,
      process.env.AGORA_TOOL_SECRET!,
    );
    const { error: insertError } = await db.from("voice_sessions").insert({
      id,
      organization_id: org.id,
      user_id: member.user_id,
      order_id: order.id,
      channel,
      status: "starting",
      token_hash: hashToken(credential),
      expires_at: new Date(expires * 1000).toISOString(),
    });
    if (insertError)
      throw new Error(
        insertError.code === "23505"
          ? "End the sample merchandiser's active conversation before running this diagnostic."
          : "Could not record the diagnostic session.",
      );
    sessionId = id;
    const token = RtcTokenBuilder.buildTokenWithUid(
      process.env.NEXT_PUBLIC_AGORA_APP_ID!,
      process.env.AGORA_APP_CERTIFICATE!,
      channel,
      2,
      RtcRole.PUBLISHER,
      120,
      120,
    );
    const config = agentConfiguration({
      sessionId: id,
      channel,
      agentToken: token,
      toolToken: credential,
      workspace: w,
      order,
    });
    config.properties.idle_timeout = 120;
    // This probe can read and calculate only. It cannot submit, approve, or select a proposal.
    config.properties.llm.tools = config.properties.llm.tools.filter((t) =>
      ["getOrderContext", "evaluateOrderChange"].includes(t.function.name),
    );
    const start = await call("/join", config);
    agentId = start.agent_id;
    if (!agentId) throw new Error("Agora did not return an agent reference.");
    const { error: activeError } = await db
      .from("voice_sessions")
      .update({ agent_id: agentId, status: "active" })
      .eq("id", id);
    if (activeError)
      throw new Error("Could not activate the diagnostic session.");
    const userToken = RtcTokenBuilder.buildTokenWithUid(
      process.env.NEXT_PUBLIC_AGORA_APP_ID!,
      process.env.AGORA_APP_CERTIFICATE!,
      channel,
      1,
      RtcRole.PUBLISHER,
      120,
      120,
    );
    await page.evaluate(
      async (data) => {
        const scope = window as unknown as {
          AgoraRTC: typeof import("agora-rtc-sdk-ng").default;
          recordDiagnosticTranscript: (data: number[]) => Promise<void>;
          playDiagnosticAudio: (bytes: number[]) => Promise<void>;
        };
        scope.AgoraRTC.setLogLevel(4);
        const rtc = scope.AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        rtc.on(
          "stream-message",
          (_uid, packet) =>
            void scope.recordDiagnosticTranscript(Array.from(packet)),
        );
        rtc.on("user-published", async (user, type) => {
          await rtc.subscribe(user, type);
          if (type === "audio") user.audioTrack?.play();
        });
        await rtc.join(data.appId, data.channel, data.token, 1);
        // Match a normal call: the remote UID must publish audio so the agent's
        // subscription/input pipeline becomes ready. The diagnostic sends silence.
        const audio = new AudioContext();
        await audio.resume();
        const destination = audio.createMediaStreamDestination();
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        gain.gain.value = 0;
        oscillator.connect(gain).connect(destination);
        oscillator.start();
        const track = scope.AgoraRTC.createCustomAudioTrack({
          mediaStreamTrack: destination.stream.getAudioTracks()[0],
        });
        await rtc.publish(track);
        scope.playDiagnosticAudio = async (bytes) => {
          const buffer = await audio.decodeAudioData(
            Uint8Array.from(bytes).buffer,
          );
          const source = audio.createBufferSource();
          source.buffer = buffer;
          source.connect(destination);
          await new Promise<void>((resolve) => {
            source.onended = () => resolve();
            source.start();
          });
        };
      },
      {
        appId: process.env.NEXT_PUBLIC_AGORA_APP_ID!,
        channel,
        token: userToken,
      },
    );
    console.log("RTC subscriber connected; allowing the greeting to finish.");
    await new Promise((resolve) => setTimeout(resolve, 6500));
    if (!greetingReceived)
      throw new Error(
        "The diagnostic browser did not receive the agent greeting/transcript. RTC media connectivity must work before this check can verify Gemini. Your own browser's working greeting is a separate check.",
      );
    captureReply = true;
    reply = "";
    console.log(
      `Testing ${process.env.GEMINI_MODEL} through Agora, Gemini tools, and deployed callbacks. Only read-only tools are enabled.`,
    );
    if (process.env.VOICE_CHECK_WAV) {
      console.log(
        "Publishing the supplied WAV as microphone audio to exercise ASR.",
      );
      await page.evaluate(
        async (bytes) => {
          await (
            window as unknown as {
              playDiagnosticAudio: (bytes: number[]) => Promise<void>;
            }
          ).playDiagnosticAudio(bytes);
        },
        Array.from(readFileSync(process.env.VOICE_CHECK_WAV)),
      );
    } else
      await call(`/agents/${agentId}/think`, {
        text: `Evaluate order ${order.id} at 600 pieces, requesting shipment ${order.committed_ship_date}, allow_overtime false, sizes_json empty string. Use evaluateOrderChange now. Do not submit a proposal. Explain feasible shipments.`,
        on_listening_action: "interrupt",
        on_thinking_action: "interrupt",
        on_speaking_action: "interrupt",
      });
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const { data: s, error } = await db
        .from("voice_sessions")
        .select("evaluation,last_error,tool_state")
        .eq("id", id)
        .single();
      if (error) throw new Error("Cannot read diagnostic progress.");
      if (s.last_error) throw new Error(s.last_error);
      // A fallback or delayed greeting is not a successful conversational answer.
      if (s.evaluation && replyFinal && reply && !/couldn't complete that check|let's review order/i.test(reply)) {
        const evaluation = s.evaluation as Evaluation;
        console.log(
          `PASS: live Gemini tool call evaluated ${evaluation.target_quantity} pieces after approximately ${(i + 1) * 3}s.`,
        );
        for (const plan of evaluation.plans)
          console.log(
            `${plan.title}: ${plan.shipments.map((x) => `${x.quantity} pieces on ${x.ship_date}`).join("; ")}`,
          );
        console.log(`Agent reply: ${reply}`);
        return;
      }
      if ((i + 1) % 5 === 0)
        console.log(
          `Waiting ${(i + 1) * 3}s; last recorded operation: ${s.tool_state?.operation ?? "no tool callback yet"}.`,
        );
    }
    throw new Error(
      "No complete evaluation and spoken reply arrived within 60 seconds. Check model availability, provider errors, and callback reachability.",
    );
  } finally {
    let ended = true;
    if (agentId) {
      try {
        await call(`/agents/${agentId}/leave`, {});
        console.log("Diagnostic agent stopped.");
        try {
          const turns = await call(`/agents/${agentId}/turns`);
          const failure = summarizeAgentFailure(turns.turns ?? []);
          if (failure) console.log(failure);
        } catch {
          /* Turn metadata may not be available immediately. */
        }
      } catch {
        ended = false;
        console.log(
          "Agent stop needs a cleanup retry; the diagnostic credential expires after two minutes.",
        );
      }
    }
    if (sessionId)
      await db
        .from("voice_sessions")
        .update({ status: ended ? "ended" : "stopping" })
        .eq("id", sessionId);
    await browser?.close();
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Voice diagnostic failed.",
  );
  process.exitCode = 1;
});
