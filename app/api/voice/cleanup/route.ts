import { timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/supabase/server";
import { stopAgent } from "@/lib/voice/provider";
export const maxDuration = 60;
export async function GET(request: Request) {
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`,
    actual = request.headers.get("authorization") ?? "";
  if (
    !process.env.CRON_SECRET ||
    Buffer.byteLength(expected) !== Buffer.byteLength(actual) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = adminClient();
  const { data, error } = await db
    .from("voice_sessions")
    .select("id,agent_id")
    .in("status", ["starting", "active", "stopping"])
    .lt("expires_at", new Date().toISOString())
    .limit(20);
  if (error)
    return Response.json({ error: "Cleanup query failed" }, { status: 500 });
  const results = await Promise.allSettled(
    (data ?? []).map(async (s) => {
      if (s.agent_id) await stopAgent(s.agent_id);
      const { error } = await db
        .from("voice_sessions")
        .update({ status: "ended" })
        .eq("id", s.id);
      if (error) throw error;
    }),
  );
  return Response.json({
    ended: results.filter((r) => r.status === "fulfilled").length,
    retry: results.filter((r) => r.status === "rejected").length,
  });
}
