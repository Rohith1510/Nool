type ObjectValue = Record<string, unknown>;
export function object(value: unknown): ObjectValue {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as ObjectValue : {};
}
// Gemini requires these opaque signatures when Agora returns a tool result.
export function restoreSignatures(messages: ObjectValue[], metadata: ObjectValue) {
  return messages.map((message) => ({ ...message,
    ...(Array.isArray(message.tool_calls) ? { tool_calls: message.tool_calls.map((value) => {
      const call = object(value);
      return { ...call, ...(typeof call.id === "string" && metadata[call.id]
        ? { extra_content: metadata[call.id] } : {}) };
    }) } : {}),
  }));
}
export function captureSignatures(message: ObjectValue, previous: ObjectValue) {
  const metadata = { ...previous };
  for (const value of Array.isArray(message.tool_calls) ? message.tool_calls : []) {
    const call = object(value);
    if (typeof call.id === "string" && call.extra_content)
      metadata[call.id] = call.extra_content;
  }
  return Object.fromEntries(Object.entries(metadata).slice(-64));
}
export function publicProgress(value: unknown) {
  const state = object(value);
  return { operation: state.operation, running: state.running, at: state.at };
}
export function completionEvents(completion: ObjectValue) {
  const choice = object((completion.choices as unknown[])?.[0]);
  const message = object(choice.message);
  const delta = { ...message };
  delete delta.extra_content;
  if (Array.isArray(delta.tool_calls)) delta.tool_calls = delta.tool_calls.map((value, index) => {
    const call = { ...object(value), index };
    delete (call as ObjectValue).extra_content;
    return call;
  });
  const chunk = (part: ObjectValue, finish: unknown) => `data: ${JSON.stringify({
    id: completion.id, object: "chat.completion.chunk", created: completion.created,
    model: completion.model, choices: [{ index: 0, delta: part, finish_reason: finish }],
  })}\n\n`;
  return chunk(delta, null) + chunk({}, choice.finish_reason ?? "stop") + "data: [DONE]\n\n";
}
