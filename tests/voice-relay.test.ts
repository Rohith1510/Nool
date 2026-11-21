import { test } from "node:test";
import assert from "node:assert/strict";
import { relayTools, relayFailure } from "../lib/voice/relay";
const tools = [
  {
    type: "function",
    function: { name: "evaluateOrderChange" },
    server: { headers: { Authorization: "private" } },
  },
  { type: "function", function: { name: "createChangeProposal" } },
];
test("confirmed submission is forced once, followed by a final answer after its result", () => {
  const messages = [{ role: "user", content: "Yes." }];
  assert.deepEqual(relayTools(tools, true, messages).tool_choice, {
    type: "function",
    function: { name: "createChangeProposal" },
  });
  const continued = [
    ...messages,
    {
      role: "assistant",
      tool_calls: [{ id: "call1", function: { name: "createChangeProposal" } }],
    },
    { role: "tool", tool_call_id: "call1", content: "cancelled" },
  ];
  assert.equal(relayTools(tools, true, continued).tool_choice, "none");
  assert.equal(relayTools(tools, false, continued).tool_choice, "none");
});
test("relay never forces an undeclared tool and retains historical schemas without private callbacks", () => {
  assert.deepEqual(relayTools(undefined, true, []), {});
  assert.equal(relayTools([tools[0]], true, []).tool_choice, "auto");
  const result = relayTools(tools, false, []);
  assert.equal(result.tools?.length, 2);
  assert.ok(!JSON.stringify(result).includes("private"));
  assert.match(relayFailure(429), /rate limit/);
  assert.match(relayFailure(400), /format/);
  const privateProviderBody = "tool_choice invalid: private-key-123";
  assert.match(
    relayFailure(400, privateProviderBody),
    /tool conversation format/,
  );
  assert.ok(!relayFailure(400, privateProviderBody).includes("private-key"));
  assert.match(relayFailure(400, "Missing thought_signature"), /signatures/);
});
