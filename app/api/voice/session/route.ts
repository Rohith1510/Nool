import { z } from "zod";
import { randomUUID } from "node:crypto";
import { RtcTokenBuilder, RtcRole } from "agora-token";
import { sessionWorkspace, requireSession } from "@/lib/data";
import { adminClient } from "@/lib/supabase/server";
import { readiness } from "@/lib/readiness";
import { apiError, checkOrigin } from "@/lib/http";
import { hashToken, issueToolToken } from "@/lib/voice/security";
import { agentConfiguration } from "@/lib/voice/config";
import { agoraRequest, stopAgent } from "@/lib/voice/provider";
export const maxDuration = 60;
export async function POST(request: Request) {
  let sessionId: string | null = null;
  let startedAgent: string | null = null;
  try {
    checkOrigin(request);
    const { order_id } = z
      .object({ order_id: z.uuid() })
      .parse(await request.json());
    const { workspace, user } = await sessionWorkspace();
    const missing = readiness().filter((c) => !c.configured);
    if (missing.length)
      throw new Error(
        `Voice setup required: ${missing.map((c) => c.name).join(", ")}. Open Setup to configure them.`,
      );
    const order = workspace.orders.find((o) => o.id === order_id);
    if (!order) throw new Error("Order not found in your organization.");
    const db = adminClient();
    // Reap expired/unfinished sessions before attempting the unique active-session insert.
    const { data: previous, error: previousError } = await db
      .from("voice_sessions")
      .select("id,agent_id,status,expires_at")
      .eq("user_id", user.id)
      .in("status", ["starting", "active", "stopping"]);
    if (previousError) throw new Error(previousError.message);
    for (const prev of previous ?? []) {
      if (
        Date.parse(prev.expires_at) > Date.now() &&
        prev.status !== "stopping"
      )
        throw new Error(
          "A conversation is already active. End it in the other tab, or wait for its 10-minute expiry.",
        );
      if (prev.agent_id) await stopAgent(prev.agent_id);
      const { error } = await db
        .from("voice_sessions")
        .update({ status: "ended" })
        .eq("id", prev.id);
      if (error) throw new Error(error.message);
    }
    const id = randomUUID();
    const channel = `nool_${id.replaceAll("-", "")}`;
    const lifetime = 600;
    const expires = Math.floor(Date.now() / 1000) + lifetime;
    const toolToken = issueToolToken(
      id,
      expires,
      process.env.AGORA_TOOL_SECRET!,
    );
    const { error: insertError } = await db.from("voice_sessions").insert({
      id,
      organization_id: workspace.organization.id,
      user_id: user.id,
      order_id,
      channel,
      status: "starting",
      token_hash: hashToken(toolToken),
      expires_at: new Date(expires * 1000).toISOString(),
    });
    if (insertError)
      throw new Error(
        insertError.code === "23505"
          ? "A conversation is already active. End the other session first."
          : insertError.message,
      );
    sessionId = id;
    const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID!,
      certificate = process.env.AGORA_APP_CERTIFICATE!;
    const token = (uid: number) =>
      RtcTokenBuilder.buildTokenWithUid(
        appId,
        certificate,
        channel,
        uid,
        RtcRole.PUBLISHER,
        lifetime,
        lifetime,
      );
    const result = await agoraRequest(
      "/join",
      agentConfiguration({
        sessionId: id,
        channel,
        agentToken: token(2),
        toolToken,
        workspace,
        order,
      }),
    );
    if (!("agent_id" in result) || !result.agent_id)
      throw new Error(
        "Agora did not return a session reference. Retry the connection.",
      );
    startedAgent = result.agent_id;
    const { error: saveError } = await db
      .from("voice_sessions")
      .update({ status: "active", agent_id: startedAgent })
      .eq("id", id)
      .eq("status", "starting");
    if (saveError) throw new Error(saveError.message);
    return Response.json({
      id,
      channel,
      token: token(1),
      uid: 1,
      app_id: appId,
      expires_at: new Date(expires * 1000).toISOString(),
    });
  } catch (e) {
    if (sessionId) {
      if (startedAgent) {
        try {
          await stopAgent(startedAgent);
        } catch {
          /* Durable cleanup retries stopping sessions. */
        }
      }
      await adminClient()
        .from("voice_sessions")
        .update({
          status: startedAgent ? "stopping" : "failed",
          ...(startedAgent ? { agent_id: startedAgent } : {}),
        })
        .eq("id", sessionId);
    }
    return apiError(e);
  }
}
export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const { id } = z.object({ id: z.uuid() }).parse(await request.json());
    const { user } = await requireSession();
    const db = adminClient();
    const { data: session, error } = await db
      .from("voice_sessions")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!session) throw new Error("Session not found.");
    if (session.status === "ended") return Response.json({ ok: true });
    await db.from("voice_sessions").update({ status: "stopping" }).eq("id", id);
    if (session.agent_id) await stopAgent(session.agent_id);
    const { error: saveError } = await db
      .from("voice_sessions")
      .update({ status: "ended" })
      .eq("id", id);
    if (saveError) throw new Error(saveError.message);
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
export async function GET(request: Request) {
  try {
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    const { user } = await requireSession();
    const { data, error } = await adminClient()
      .from("voice_sessions")
      .select(
        "status,tool_state,evaluation,proposal_id,selected_plan_key,last_error,expires_at",
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Session not found.");
    return Response.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
