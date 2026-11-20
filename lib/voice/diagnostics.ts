type ProviderTurn = {
  turn_id?: number;
  end?: { type?: string; metadata?: { reason?: string; details?: string } };
};
// Never pass provider details through: they can contain credential-bearing URLs.
export function summarizeAgentFailure(turns: ProviderTurn[]): string | null {
  const failure = [...turns].reverse().find((t) => t.end?.type === "error");
  if (!failure) return null;
  let code: number | undefined;
  let status = "";
  let message = "";
  try {
    const payload = JSON.parse(failure.end?.metadata?.details ?? "{}");
    const error = Array.isArray(payload) ? payload[0]?.error : payload.error;
    code = error?.code;
    status = String(error?.status ?? "");
    message = String(error?.message ?? "");
  } catch {
    /* Unknown vendor details remain private. */
  }
  if (code === 429 || status === "RESOURCE_EXHAUSTED")
    return "Gemini quota or rate limit reached (429). Check the Google project's API quota and billing, then reconnect.";
  if (code === 503 || status === "UNAVAILABLE")
    return "Gemini is unavailable or under high demand (503). Retry with a new conversation, or configure another available Gemini text model and redeploy.";
  if (code === 401 || code === 403)
    return "Gemini rejected access. Check GEMINI_API_KEY, the model's access permissions, and regional availability in your deployment.";
  if (code === 404)
    return "The configured Gemini model was not found. Check GEMINI_MODEL in Vercel and redeploy.";
  if (code === 400 && /model turn|function|tool|schema|payload/i.test(message))
    return "Gemini rejected the conversation or tool format (400). Deploy the latest voice integration fix and start a new conversation.";
  if (code === 400 && /thinking|reasoning/i.test(message))
    return "Gemini rejected the reasoning setting (400). Deploy the latest low-reasoning configuration and reconnect.";
  return "The voice provider reported a response failure. Check the Agora session's turn details; ordinary order controls remain available.";
}
