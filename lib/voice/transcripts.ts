export type Transcript = {
  id: string;
  role: "user" | "assistant";
  text: string;
  final: boolean;
};
// Agora protocol v2: messageId|partIndex|partCount|base64. Bounded, deduplicated chunks.
export class TranscriptDecoder {
  private chunks = new Map<
    string,
    { parts: Map<number, string>; count: number; at: number }
  >();
  decode(data: Uint8Array): Transcript | null {
    const raw = new TextDecoder().decode(data);
    let payload: unknown;
    for (const [id, c] of this.chunks)
      if (Date.now() - c.at > 30000) this.chunks.delete(id);
    if (raw.startsWith("{")) payload = JSON.parse(raw);
    else {
      const [id, indexText, totalText, content] = raw.split("|");
      const index = Number(indexText);
      const total = totalText === "???" ? -1 : Number(totalText);
      if (
        !id ||
        content === undefined ||
        !Number.isInteger(index) ||
        index < 0 ||
        index > 2048 ||
        !Number.isInteger(total) ||
        total === 0 ||
        total > 2048 ||
        content.length > 65536
      )
        return null;
      if (this.chunks.size >= 64 && !this.chunks.has(id))
        this.chunks.delete(this.chunks.keys().next().value!);
      const chunk = this.chunks.get(id) ?? {
        parts: new Map<number, string>(),
        count: total,
        at: Date.now(),
      };
      chunk.parts.set(index, content);
      if (total > 0) chunk.count = total;
      this.chunks.set(id, chunk);
      if (chunk.count < 1 || chunk.parts.size < chunk.count) return null;
      const joined = [...chunk.parts]
        .sort((a, b) => a[0] - b[0])
        .map((p) => p[1])
        .join("");
      this.chunks.delete(id);
      const bytes = Uint8Array.from(atob(joined), (c) => c.charCodeAt(0));
      payload = JSON.parse(new TextDecoder().decode(bytes));
    }
    if (!payload || typeof payload !== "object") return null;
    const m = payload as Record<string, unknown>;
    if (
      (m.object !== "user.transcription" &&
        m.object !== "assistant.transcription") ||
      typeof m.text !== "string" ||
      !m.text.trim()
    )
      return null;
    const role = m.object === "user.transcription" ? "user" : "assistant";
    return {
      id: `${role}-${String(m.turn_id ?? m.message_id ?? "current")}`,
      role,
      text: m.text,
      final: role === "user" ? m.final === true : m.turn_status === 1,
    };
  }
}
