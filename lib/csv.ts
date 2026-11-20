export type StockRow = {
  row: number;
  code: string;
  delta_kg: number;
  reason: string;
  error: string | null;
};
export function parseStockCsv(text: string, knownCodes: string[]): StockRow[] {
  const records: string[][] = [];
  let record: string[] = [],
    field = "",
    quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      record.push(field.trim());
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && input[i + 1] === "\n") i++;
      record.push(field.trim());
      if (record.some(Boolean)) records.push(record);
      record = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field.");
  record.push(field.trim());
  if (record.some(Boolean)) records.push(record);
  if (records.shift()?.join(",") !== "code,delta_kg,reason")
    throw new Error("Use the CSV header: code,delta_kg,reason");
  if (records.length < 1 || records.length > 100)
    throw new Error("Import 1–100 rows at a time.");
  return records.map((r, i) => {
    const delta = Number(r[1]);
    return {
      row: i + 2,
      code: r[0],
      delta_kg: delta,
      reason: r[2] ?? "",
      error:
        r.length !== 3
          ? "Expected 3 columns"
          : !knownCodes.includes(r[0])
            ? "Unknown fabric code"
            : !r[1] ||
                !Number.isFinite(delta) ||
                Math.abs(delta) > 1000000 ||
                Math.abs(delta * 1000 - Math.round(delta * 1000)) > 0.00001
              ? "Use kg with up to 3 decimal places"
              : (r[2]?.length ?? 0) < 3
                ? "A reason is required"
                : (r[2]?.length ?? 0) > 1000
                  ? "Reason must be 1000 characters or fewer"
                  : null,
    };
  });
}
