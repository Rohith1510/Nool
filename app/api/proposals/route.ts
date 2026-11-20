import { sessionWorkspace } from "@/lib/data";
import { proposalSchema } from "@/lib/validation";
import { submitProposal } from "@/lib/proposals";
import { apiError, checkOrigin } from "@/lib/http";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const input = proposalSchema.parse(await request.json());
    const { workspace, user } = await sessionWorkspace();
    return Response.json(await submitProposal(workspace, user.id, input));
  } catch (e) {
    return apiError(e);
  }
}
