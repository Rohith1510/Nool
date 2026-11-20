import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { parseStockCsv } from "../lib/csv";
import { issueToolToken, verifyToolToken } from "../lib/voice/security";
import { toolDefinitions } from "../lib/voice/config";
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
