import { z } from "zod";
import { requireSession } from "@/lib/data";
import { adminClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/http";
import { summarizeAgentFailure } from "@/lib/voice/diagnostics";
export async function GET(request: Request) {
  try {
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    const { user } = await requireSession();
    const { data: session, error } = await adminClient()
      .from("voice_sessions")
      .select("agent_id,last_error")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || !session)
      throw new Error("Session not found for this account.");
    if (session.last_error)
      return Response.json(
        { message: session.last_error },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    if (!session.agent_id) throw new Error("The agent has not started yet.");
    const response = await fetch(
      `https://api.agora.io/api/conversational-ai-agent/v2/projects/${process.env.NEXT_PUBLIC_AGORA_APP_ID}/agents/${encodeURIComponent(session.agent_id)}/turns`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${process.env.AGORA_CUSTOMER_ID}:${process.env.AGORA_CUSTOMER_SECRET}`).toString("base64")}`,
        },
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      },
    );
    if (!response.ok)
      throw new Error(
        "Agent turn details are not available yet. End the conversation and check again.",
      );
    const data = await response.json();
    return Response.json(
      {
        message:
          summarizeAgentFailure(data.turns ?? []) ??
          "No completed provider failure is recorded yet. The response may still be pending. You can end the conversation and retry, or use Evaluate change.",
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
