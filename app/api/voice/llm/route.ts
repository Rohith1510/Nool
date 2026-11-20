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
    const payload = JSON.stringify({
      model: process.env.GEMINI_MODEL,
      messages: restoreSignatures(input.messages.map(object), object(object(session.tool_state)._llmToolMetadata)),
      ...(Array.isArray(input.tools) ? { tools: input.tools.map((value) => {
        const tool = object(value);
        return { type: "function", function: tool.function };
      }) } : {}),
      ...(input.tool_choice ? { tool_choice: input.tool_choice } : {}),
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
    phase = "saving tool metadata";
    await updateVoiceState(session.id, (state) => ({ ...state,
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
