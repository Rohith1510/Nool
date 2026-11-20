import { sessionWorkspace } from "@/lib/data";
import { apiError } from "@/lib/http";
export async function GET() {
  try {
    return Response.json((await sessionWorkspace()).workspace, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
