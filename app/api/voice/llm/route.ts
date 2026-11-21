import { fingerprint, hasSubmissionResult, submissionConsent } from "@/lib/voice/confirmation";
import { request as httpsRequest } from "node:https";
import { authenticateVoice, updateVoiceState } from "@/lib/voice/session-auth";
import { captureSignatures, completionEvents, object, restoreSignatures } from "@/lib/voice/chat";
export const maxDuration = 60;
export async function POST(request: Request) {
  let authenticated;
  try { authenticated = await authenticateVoice(request); }
  catch { return Response.json({ error: { message: "Unauthorized voice session." } }, { status: 401 }); }
  const { db, session } = authenticated;
  let phase = "reading conversation";
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > 1_000_000) return new Response("Request too large", { status: 413 });
    const input = object(JSON.parse(text));
    if (!Array.isArray(input.messages) || input.messages.length > 100) throw new Error("Invalid conversation.");
    const messages = input.messages.map(object);
    const consent = submissionConsent(messages);
    const maySubmit = consent.allowed && session.selected_plan_key && object(session.tool_state)._selectionUserTurn && object(session.tool_state)._selectionUserTurn !== consent.turn;
    await updateVoiceState(session.id, (state) => ({ ...state, _latestUserTurn: consent.turn, _submissionCheck: { normalizedText: consent.text.slice(0, 300), recognized: consent.allowed, planSelected: Boolean(session.selected_plan_key), selectionRecorded: Boolean(object(session.tool_state)._selectionUserTurn), separateTurn: object(session.tool_state)._selectionUserTurn !== consent.turn, enabled: Boolean(maySubmit) } }));
    const payload = JSON.stringify({
      model: process.env.GEMINI_MODEL,
      messages: restoreSignatures(input.messages.map(object), object(object(session.tool_state)._llmToolMetadata)),
      ...(Array.isArray(input.tools) ? { tools: input.tools.filter((value) => maySubmit || object(object(value).function).name !== "createChangeProposal").map((value) => {
        const tool = object(value);
        return { type: "function", function: tool.function };
      }) } : {}),
      ...(maySubmit && !hasSubmissionResult(messages)
        ? { tool_choice: { type: "function", function: { name: "createChangeProposal" } } }
        : input.tool_choice ? { tool_choice: input.tool_choice } : {}),
      reasoning_effort: "low", max_tokens: 2048, stream: false,
    });
    phase = "requesting Gemini";
    const completion = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const upstream = httpsRequest({ hostname: "generativelanguage.googleapis.com",
        path: "/v1beta/openai/chat/completions", method: "POST", family: 4,
        headers: { Authorization: `Bearer ${process.env.GEMINI_API_KEY}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
      }, (response) => {
        let body = "";
        response.on("data", (chunk) => { body += chunk; if (body.length > 2_000_000) upstream.destroy(new Error("Response too large")); });
        response.on("end", () => {
          if (!response.statusCode || response.statusCode >= 300) return reject(new Error(`Gemini returned HTTP ${response.statusCode ?? 502}. Retry the conversation or use Evaluate change.`));
          try { resolve(object(JSON.parse(body))); } catch { reject(new Error("Invalid Gemini response.")); }
        });
        response.on("error", reject);
      });
      upstream.setTimeout(45000, () => upstream.destroy(new Error("Gemini timed out. Retry or use Evaluate change.")));
      upstream.on("error", reject);
      upstream.end(payload);
    });
    const choice = object((completion.choices as unknown[])?.[0]);
    if (!choice.message) throw new Error("Gemini returned no answer. Retry or use Evaluate change.");
    const grants: Record<string, unknown> = {};
    if (maySubmit) for (const value of Array.isArray(object(choice.message).tool_calls) ? object(choice.message).tool_calls as unknown[] : []) {
      const call = object(value);
      if (object(call.function).name === "createChangeProposal" && typeof call.id === "string")
        grants[call.id] = { turn: consent.turn, plan: session.selected_plan_key, evaluation: fingerprint(session.evaluation), expires: Date.now() + 120000 };
    }
    phase = "saving tool metadata";
    await updateVoiceState(session.id, (state) => ({ ...state,
      _submissionCalls: { ...object(state._submissionCalls), ...grants },
      _llmToolMetadata: captureSignatures(object(choice.message), object(state._llmToolMetadata)),
    }));
    phase = "formatting reply";
    return input.stream === false ? Response.json(completion) : new Response(completionEvents(completion), {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error && /^(Gemini|Invalid conversation|Invalid Gemini|Conversation state|Could not)/.test(error.message)
      ? error.message : `The conversation service failed while ${phase} (${error instanceof Error ? error.name : "unknown error"}). Retry or use Evaluate change.`;
    await db.from("voice_sessions").update({ last_error: message }).eq("id", session.id);
    return Response.json({ error: { message } }, { status: 502 });
  }
}
