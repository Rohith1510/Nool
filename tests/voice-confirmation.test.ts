import { test } from "node:test";
import assert from "node:assert/strict";
import { canSubmitVoice, fingerprint, submissionConsent } from "../lib/voice/confirmation";

const ask = { role: "assistant", content: "Sizes are S 120, M 180, L 180, XL 120. Split freight cost is unavailable. Shall I submit this proposal?" };
test("explanation and selection are not submission consent, even after an earlier confirmation question", () => {
  for (const content of [
    "Select the splits shipment. Explain the size and cost before submitting.",
    "Can another production line help?", "Do not submit the proposal.",
    "Yes, but explain the cost first", "Can you submit this proposal?",
  ]) assert.equal(submissionConsent([ask, { role: "user", content }]).allowed, false, content);
});
test("a separate explicit submission confirmation is recognized", () => {
  for (const content of ["Yes. Submit that proposal for production approval.", "Yes. Submit for production approval.", "Submit for approval", "Please submit the proposal", "Yes."])
    assert.equal(submissionConsent([ask, { role: "user", content }]).allowed, true);
  assert.equal(submissionConsent([{ role: "user", content: "yes" }]).allowed, false);
});
test("ASR fragments preserve submission intent and preceding negation", () => {
  assert.equal(submissionConsent([ask, { role: "user", content: "Yes. Submit" }]).allowed, false);
  assert.equal(submissionConsent([ask, { role: "user", content: "Yes. Submit" }, { role: "user", content: "the proposal." }]).allowed, true);
  assert.equal(submissionConsent([ask, { role: "user", content: "Do not" }, { role: "user", content: "submit the proposal." }]).allowed, false);
  assert.equal(submissionConsent([ask, { role: "user", content: "Yes. Submit" }, { role: "user", content: "only after explaining the cost." }]).allowed, false);
  assert.equal(submissionConsent([ask, { role: "user", content: "Explain the cost before" }, { role: "user", content: "submitting the proposal." }]).allowed, false);
});
test("grants bind submission to its call, latest user turn, plan, evaluation and expiry", () => {
  const evaluation = { quantity: 600, version: 1 };
  const state = { _latestUserTurn: "turn2", _submissionCalls: { call1: {
    turn: "turn2", plan: "split", evaluation: fingerprint(evaluation), expires: Date.now() + 60000,
  } } };
  assert.equal(canSubmitVoice(state, "call1", "split", evaluation), true);
  assert.equal(canSubmitVoice(state, "other", "split", evaluation), false);
  assert.equal(canSubmitVoice(state, "call1", "later", evaluation), false);
  assert.equal(canSubmitVoice(state, "call1", "split", { ...evaluation, version: 2 }), false);
  assert.equal(canSubmitVoice({ ...state, _latestUserTurn: "turn3" }, "call1", "split", evaluation), false);
  state._submissionCalls.call1.expires = 0;
  assert.equal(canSubmitVoice(state, "call1", "split", evaluation), false);
});
