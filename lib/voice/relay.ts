import { hasSubmissionResult } from "./confirmation";
import { object } from "./chat";

// Keep the declared tools stable across history, including past submission calls.
// The authenticated callback remains the authority for whether a write is allowed.
export function relayTools(
  input: unknown,
  maySubmit: boolean,
  messages: Record<string, unknown>[],
) {
  const tools = (Array.isArray(input) ? input : [])
    .map(object)
    .filter((tool) => typeof object(tool.function).name === "string")
    .map((tool) => ({ type: "function", function: tool.function }));
  if (!tools.length) return {};
  const submitted = hasSubmissionResult(messages);
  const available = tools.some(
    (tool) => object(tool.function).name === "createChangeProposal",
  );
  return {
    tools,
    // Do not inherit Agora's forced choice on the tool-result continuation:
    // that must produce an answer, rather than another submission attempt.
    tool_choice: submitted
      ? "none"
      : maySubmit && available
        ? { type: "function", function: { name: "createChangeProposal" } }
        : "auto",
  };
}

export function relayFailure(status: number, body = "") {
  if (status === 429)
    return "Gemini rate limit reached (429). Wait briefly, then retry or use the order controls.";
  if (status === 401 || status === 403)
    return "Gemini access was rejected. Check the configured API key and model permissions.";
  if (status === 400 && /thought.?signature|thought signature/i.test(body))
    return "Gemini rejected missing conversation signatures (400). Reconnect to start fresh tool history, or use the order controls.";
  if (
    status === 400 &&
    /tool_choice|function_call|tool.call|function.response/i.test(body)
  )
    return "Gemini rejected the tool conversation format (400). Reconnect or use the order controls.";
  if (status === 400)
    return "Gemini rejected the conversation format (400). Start a new conversation or use the order controls.";
  return `Gemini returned HTTP ${status}. Retry or use the order controls.`;
}
