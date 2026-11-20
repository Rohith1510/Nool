import { z } from "zod";
import { sessionWorkspace } from "@/lib/data";
import { apiError, checkOrigin } from "@/lib/http";
import { parseStockCsv } from "@/lib/csv";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const input = z
      .object({ csv: z.string().max(100000), idempotency_key: z.uuid() })
      .parse(await request.json());
    const { workspace, supabase } = await sessionWorkspace();
    const rows = parseStockCsv(
      input.csv,
      workspace.fabrics.map((f) => f.code),
    );
    if (rows.some((r) => r.error))
      return Response.json(
        { error: "Correct invalid rows before importing.", rows },
        { status: 400 },
      );
    const { data, error } = await supabase.rpc("import_stock", {
      p_org: workspace.organization.id,
      p_rows: rows.map(({ code, delta_kg, reason }) => ({
        code,
        delta_kg,
        reason,
      })),
      p_key: input.idempotency_key,
    });
    if (error) throw new Error(error.message);
    return Response.json(data);
  } catch (e) {
    return apiError(e);
  }
}
