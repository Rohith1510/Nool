import { createHash } from "node:crypto";
import { object } from "./chat";

export const fingerprint = (value: unknown) => createHash("sha256")
  .update(JSON.stringify(value) ?? "null").digest("hex");

// Deliberately conservative. Ambiguous speech must lead to another question,
// never a write. These words come from the provider's user messages, not tool args.
export function submissionConsent(messages: Record<string, unknown>[]) {
  const lastUser = messages.findLastIndex((m) => m.role === "user");
  const content = messages[lastUser]?.content;
  const text = typeof content === "string" ? content.trim().toLowerCase().replace(/[.!?,]+/g, " ").replace(/\s+/g, " ").trim() : "";
  const turn = fingerprint(messages.filter((m) => m.role === "user").map((m) => m.content));
  const explicit = /^(?:yes\s+|please\s+|yes please\s+)?submit (?:that |this |the )?(?:proposal|plan|change)(?: for production approval| for approval)?(?: please)?$/.test(text);
  const priorAssistant = messages.slice(0, lastUser).findLast((m) => m.role === "assistant" && typeof m.content === "string");
  const asked = /(?:shall|should|may|can) i submit|would you like me to submit|confirm.{0,30}submit/i.test(String(priorAssistant?.content ?? ""));
  return { turn, allowed: explicit || (asked && /^(yes|yes please|confirm|confirmed|go ahead)$/.test(text)) };
}

export function canSubmitVoice(state: unknown, requestKey: string, plan: unknown, evaluation: unknown) {
  const grant = object(object(object(state)._submissionCalls)[requestKey]);
  return grant.turn === object(state)._latestUserTurn && grant.plan === plan && grant.evaluation === fingerprint(evaluation)
    && typeof grant.expires === "number" && grant.expires > Date.now();
}
