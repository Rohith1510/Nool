import { sessionWorkspace } from "@/lib/data";
import { adjustmentSchema } from "@/lib/validation";
import { apiError, checkOrigin } from "@/lib/http";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const input = adjustmentSchema.parse(await request.json());
    const { workspace, supabase } = await sessionWorkspace();
    const { kind, id, reason, idempotency_key, ...values } = input;
    const { data, error } = await supabase.rpc("adjust_resources", {
      p_org: workspace.organization.id,
      p_kind: kind,
      p_id: id,
      p_values: values,
      p_reason: reason,
      p_key: idempotency_key,
    });
    if (error) throw new Error(error.message);
    return Response.json(data);
  } catch (e) {
    return apiError(e);
  }
}
