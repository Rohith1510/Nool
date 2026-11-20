import { createHash } from "node:crypto";
import { object } from "./chat";

export const fingerprint = (value: unknown) => createHash("sha256")
  .update(JSON.stringify(value) ?? "null").digest("hex");

export function messageText(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (Array.isArray(content) && content.every((part) => object(part).type === "text" && typeof object(part).text === "string"))
    return content.map((part) => object(part).text).join(" ");
  return null;
}

export function hasSubmissionResult(messages: Record<string, unknown>[]) {
  const afterUser = messages.slice(messages.findLastIndex((m) => m.role === "user") + 1);
  const calls = new Set(afterUser.flatMap((m) => Array.isArray(m.tool_calls) ? m.tool_calls : [])
    .map(object).filter((call) => object(call.function).name === "createChangeProposal").map((call) => call.id));
  return afterUser.some((m) => m.role === "tool" && calls.has(m.tool_call_id));
}

// Deliberately conservative. Ambiguous speech must lead to another question,
// never a write. These words come from the provider's user messages, not tool args.
export function submissionConsent(messages: Record<string, unknown>[]) {
  const lastUser = messages.findLastIndex((m) => m.role === "user");
  // ASR can split one utterance into adjacent user messages. Keep the entire
  // block so a preceding "do not" cannot be lost when joining fragments.
  let start = lastUser;
  while (start > 0 && messages[start - 1].role === "user") start--;
  const fragments = messages.slice(start, lastUser + 1).map((m) => messageText(m.content));
  const content = fragments.every((value) => typeof value === "string")
    ? fragments.join(" ") : null;
  const text = typeof content === "string" ? content.trim().toLowerCase().replace(/[.!?,]+/g, " ").replace(/\s+/g, " ").trim() : "";
  const turn = fingerprint(messages.filter((m) => m.role === "user").map((m) => m.content));
  const explicit = /^(?:yes\s+|please\s+|yes please\s+)?submit (?:(?:that |this |the )?(?:proposal|plan|change)(?: for production approval| for approval)?|for (?:production )?approval)(?: please)?$/.test(text);
  const priorAssistant = messages.slice(0, lastUser).findLast((m) => m.role === "assistant" && messageText(m.content));
  const asked = /(?:shall|should|may|can) i submit|would you like me to submit|confirm.{0,30}submit/i.test(messageText(priorAssistant?.content) ?? "");
  return { turn, allowed: explicit || (asked && /^(yes|yes please|confirm|confirmed|go ahead)$/.test(text)) };
}

export function canSubmitVoice(state: unknown, requestKey: string, plan: unknown, evaluation: unknown) {
  const grant = object(object(object(state)._submissionCalls)[requestKey]);
  return grant.turn === object(state)._latestUserTurn && grant.plan === plan && grant.evaluation === fingerprint(evaluation)
    && typeof grant.expires === "number" && grant.expires > Date.now();
}
