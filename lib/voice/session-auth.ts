import "server-only";
import { adminClient } from "@/lib/supabase/server";
import { hashToken, verifyToolToken } from "./security";
import { object } from "./chat";
export async function authenticateVoice(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /i, "") ?? "";
  const signed = verifyToolToken(token, process.env.AGORA_TOOL_SECRET ?? "");
  const db = adminClient();
  const { data: session, error } = await db.from("voice_sessions").select("*")
    .eq("id", signed.sessionId).eq("token_hash", hashToken(token))
    .in("status", ["starting", "active"]).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error || !session) throw new Error("Unauthorized or expired voice session.");
  return { db, session };
}
// Compare-and-swap protects signatures from concurrent tool progress updates.
export async function updateVoiceState(id: string, change: (state: Record<string, unknown>) => Record<string, unknown>) {
  const db = adminClient();
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data, error } = await db.from("voice_sessions").select("tool_state").eq("id", id).single();
    if (error) throw new Error("Could not read conversation state.");
    const previous = data.tool_state;
    const { data: saved, error: saveError } = await db.from("voice_sessions")
      .update({ tool_state: change(object(previous)) }).eq("id", id)
      .eq("tool_state", JSON.stringify(previous)).select("id");
    if (saveError) throw new Error("Could not save conversation state.");
    if (saved?.length) return;
  }
  throw new Error("Conversation state changed. Please retry.");
}
