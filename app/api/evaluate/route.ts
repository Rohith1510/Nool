import { sessionWorkspace } from "@/lib/data";
import { evaluateChange } from "@/lib/calculations";
import { changeSchema } from "@/lib/validation";
import { apiError, checkOrigin } from "@/lib/http";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const input = changeSchema.parse(await request.json());
    const { workspace } = await sessionWorkspace();
    return Response.json(evaluateChange(workspace, input));
  } catch (e) {
    return apiError(e);
  }
}
