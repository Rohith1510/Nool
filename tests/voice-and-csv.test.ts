import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { parseStockCsv } from "../lib/csv";
import { issueToolToken, verifyToolToken } from "../lib/voice/security";
import { toolDefinitions, agentConfiguration } from "../lib/voice/config";
import { summarizeAgentFailure } from "../lib/voice/diagnostics";
import { readFileSync } from "node:fs";
import { TranscriptDecoder } from "../lib/voice/transcripts";
import { describeChanges } from "../lib/changes";
import { evaluateChange } from "../lib/calculations";
import { sampleWorkspace, sampleIds } from "../lib/sample";
test("session credentials reject tampering and expiry", () => {
  const id = randomUUID(),
    secret = "a-long-test-secret";
  const token = issueToolToken(id, Math.floor(Date.now() / 1000) + 60, secret);
  assert.equal(verifyToolToken(token, secret).sessionId, id);
  assert.throws(() => verifyToolToken(token + "x", secret));
  assert.throws(() => verifyToolToken(issueToolToken(id, 1, secret), secret));
  assert.throws(() => verifyToolToken(token, "other-secret"));
});
test("Agora tools use alphanumeric names, HTTPS callbacks and session authorization", () => {
  const tools = toolDefinitions(
    "https://nool.example",
    "Bearer session-scoped",
  );
  assert.equal(tools.length, 6);
  for (const tool of tools) {
    assert.match(tool.function.name, /^[a-zA-Z][a-zA-Z0-9]*$/);
    assert.ok(tool.server.url.startsWith("https://"));
    assert.equal(tool.server.headers.Authorization, "Bearer session-scoped");
    assert.equal(tool.server.body.request_key, "{{tool_call_id}}");
    assert.equal(tool.execution.mode, "sync");
  }
});
test("v2 transcripts assemble out-of-order and duplicate chunks with Unicode intact", () => {
  const decoder = new TranscriptDecoder();
  const data = Buffer.from(
    JSON.stringify({
      object: "user.transcription",
      turn_id: 1,
      text: "நூல் 600 pieces",
      final: true,
    }),
  ).toString("base64");
  const mid = Math.floor(data.length / 2);
  const enc = new TextEncoder();
  assert.equal(decoder.decode(enc.encode(`one|1|2|${data.slice(mid)}`)), null);
  assert.equal(decoder.decode(enc.encode(`one|1|2|${data.slice(mid)}`)), null);
  const m = decoder.decode(enc.encode(`one|0|2|${data.slice(0, mid)}`));
  assert.equal(m?.text, "நூல் 600 pieces");
  assert.equal(m?.final, true);
  assert.equal(m?.role, "user");
});
test("Gemini native tool parameters omit the unsupported keyword that broke live turns", () => {
  const tools = toolDefinitions(
    "https://nool.example",
    "Bearer session-scoped",
  );
  // Actual provider rejection: Unknown name "additionalProperties" at
  // tools[0].function_declarations[n].parameters. All six tools must conform.
  const supported = new Set(["type", "properties", "required"]);
  for (const tool of tools) {
    const parameters = tool.function.parameters;
    assert.equal(parameters.type, "object");
    assert.ok(Object.keys(parameters).every((key) => supported.has(key)));
    for (const name of parameters.required)
      assert.ok(name in parameters.properties);
  }
});
test("CSV reports invalid rows, handles quoted reasons and BOM", () => {
  const rows = parseStockCsv(
    '\uFEFFcode,delta_kg,reason\r\nSJ-180-ECR,25.500,"Received, checked"\r\nUNKNOWN,2,New stock\r\nSJ-180-ECR,0.0001,Bad precision',
    ["SJ-180-ECR"],
  );
  assert.equal(rows[0].error, null);
  assert.equal(rows[0].reason, "Received, checked");
  assert.equal(rows[0].delta_kg, 25.5);
  assert.match(rows[1].error!, /Unknown/);
  assert.equal(rows[1].row, 3);
  assert.match(rows[2].error!, /decimal/);
  assert.throws(() => parseStockCsv("wrong,header", []));
});
test("stale explanations name the changed stock and line capacity", () => {
  const w = sampleWorkspace();
  const e = evaluateChange(w, { order_id: sampleIds.orderA, quantity: 600 });
  w.fabrics[0].stock_kg = 350;
  w.capacity_slots.find(
    (s) => s.line_id === sampleIds.lineB && s.work_date === "2026-11-25",
  )!.capacity = 200;
  w.organization.resource_version++;
  const changes = describeChanges(e, w);
  assert.ok(changes.some((c) => c.includes("330 kg → 350 kg")));
  assert.ok(
    changes.some((c) =>
      c.includes("Line B, 2026-11-25: standard capacity 100 → 200"),
    ),
  );
});
test("Gemini uses standard chat/tool history with bounded low reasoning", (t) => {
  const previous = process.env.APP_URL;
  process.env.APP_URL = "https://nool.example";
  t.after(() => {
    if (previous === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previous;
  });
  const w = sampleWorkspace();
  const config = agentConfiguration({
    sessionId: "test",
    channel: "test",
    agentToken: "test",
    toolToken: "test",
    workspace: w,
    order: w.orders[0],
  });
  assert.equal(config.properties.turn_detection.config.end_of_speech.mode, "vad");
  assert.equal(config.properties.turn_detection.config.end_of_speech.vad_config.silence_duration_ms, 800);
  assert.equal(config.properties.llm.api_key, "test");
  assert.equal(config.properties.llm.style, "openai");
  assert.equal(
    config.properties.llm.url,
    "https://nool.example/api/voice/llm",
  );
  assert.equal(config.properties.llm.system_messages[0].role, "system");
  assert.equal(config.properties.llm.params.reasoning_effort, "low");
  assert.equal(config.properties.llm.params.max_tokens, 1024);
  assert.ok(
    config.properties.llm.system_messages[0].content.includes(
      w.orders[0].committed_ship_date,
    ),
  );
});
test("provider diagnostics identify overload and history errors without exposing details", () => {
  const turn = (code: number, message: string) => ({
    end: {
      type: "error",
      metadata: { details: JSON.stringify({ error: { code, message } }) },
    },
  });
  assert.match(summarizeAgentFailure([turn(503, "High demand")])!, /503/);
  assert.match(
    summarizeAgentFailure([
      turn(400, "Requests ending with a model turn are not supported."),
    ])!,
    /format/,
  );
  const safe = summarizeAgentFailure([
    turn(500, "secret-key-in-provider-url"),
  ])!;
  assert.ok(!safe.includes("secret-key"));
  assert.match(
    summarizeAgentFailure([
      {
        end: {
          type: "error",
          metadata: {
            details: JSON.stringify([
              { error: { code: 503, message: "High demand" } },
            ]),
          },
        },
      },
    ])!,
    /503/,
  );
  assert.equal(summarizeAgentFailure([{ end: { type: "ok" } }]), null);
});
test("voice interface strings do not contain the observed broken UTF-8 quotes", () => {
  const source = readFileSync("components/voice-panel.tsx", "utf8");
  assert.ok(!source.includes("\u00e2\u20ac"));
  assert.ok(source.includes("&ldquo;"));
});

test("Gemini signatures survive an Agora round trip without reaching progress or SSE", async () => {
  const { captureSignatures, restoreSignatures, publicProgress, completionEvents } = await import("../lib/voice/chat");
  const signed = { role: "assistant", tool_calls: [{ id: "call_1", type: "function", function: { name: "evaluateOrderChange", arguments: "{}" }, extra_content: { google: { thought_signature: "opaque-test-signature" } } }] };
  const metadata = captureSignatures(signed, {});
  const stripped = { ...signed, tool_calls: signed.tool_calls.map((value) => ({ id: value.id, type: value.type, function: value.function })) };
  assert.deepEqual(restoreSignatures([stripped], metadata)[0], signed);
  const completion = { id: "test", choices: [{ message: signed, finish_reason: "tool_calls" }] };
  const events = completionEvents(completion);
  assert.ok(events.includes('"index":0'));
  assert.ok(events.includes("[DONE]"));
  assert.ok(!events.includes("opaque-test-signature"));
  assert.deepEqual(publicProgress({ running: true, _llmToolMetadata: metadata }), { running: true, operation: undefined, at: undefined });
});
