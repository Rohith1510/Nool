import { z } from "zod";
import { requireSession } from "@/lib/data";
import { apiError, checkOrigin } from "@/lib/http";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const id = z.uuid().parse((await params).id);
    const input = z
      .object({
        decision: z.enum(["approve", "reject"]),
        reason: z.string().trim().max(1000).optional(),
      })
      .parse(await request.json());
    const { supabase } = await requireSession();
    const { data, error } = await supabase.rpc("review_proposal", {
      p_id: id,
      p_decision: input.decision,
      p_reason: input.reason ?? null,
    });
    if (error) throw new Error(error.message);
    return Response.json(data);
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const id = z.uuid().parse((await params).id);
    const { message } = z
      .object({ message: z.string().trim().min(10).max(8000) })
      .parse(await request.json());
    const { supabase } = await requireSession();
    const { error } = await supabase.rpc("save_buyer_message", {
      p_id: id,
      p_message: message,
    });
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
