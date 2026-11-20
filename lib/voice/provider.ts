import "server-only";
const base = () =>
  `https://api.agora.io/api/conversational-ai-agent/v2/projects/${process.env.NEXT_PUBLIC_AGORA_APP_ID}`;
export async function agoraRequest(
  path: string,
  body: unknown,
): Promise<{ agent_id?: string }> {
  const response = await fetch(base() + path, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.AGORA_CUSTOMER_ID}:${process.env.AGORA_CUSTOMER_SECRET}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
    cache: "no-store",
  });
  if (!response.ok && !(path.endsWith("/leave") && response.status === 404)) {
    // Provider error bodies can echo API keys or signed URLs. Never return/log them.
    throw new Error(
      `Agora returned HTTP ${response.status}. Check project access, provider credentials, model, and voice settings in Setup.`,
    );
  }
  if (path.endsWith("/leave")) return {};
  return (await response.json()) as { agent_id: string };
}
export const stopAgent = (id: string) =>
  agoraRequest(`/agents/${encodeURIComponent(id)}/leave`, {});
