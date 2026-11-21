import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ToolCall } from "../components/hairline/tool-call";
import { StreamingText } from "../components/hairline/streaming-text";
import { publicProgress } from "../lib/voice/chat";

test("tool presentation distinguishes running, completed and failed backend states", () => {
  for (const [status, label] of [["running", "Running"], ["done", "Completed"], ["error", "Failed"]] as const) {
    const markup = renderToStaticMarkup(createElement(ToolCall, { title: "Evaluate order", status }, "Stored result or error"));
    assert.ok(markup.includes("<details"));
    assert.ok(markup.includes("<summary"));
    assert.ok(markup.includes(label));
    assert.ok(markup.includes("Stored result or error"));
  }
});
test("transcripts render provider content as escaped text with an explicit partial state", () => {
  const text = '<script>alert("unsafe")</script>\n\n600 pieces';
  const partial = renderToStaticMarkup(createElement(StreamingText, { content: text, streaming: true }));
  assert.ok(!partial.includes("<script>"));
  assert.ok(partial.includes("&lt;script&gt;"));
  assert.ok(partial.includes('aria-busy="true"'));
  assert.ok(partial.includes("600 pieces"));
  const complete = renderToStaticMarkup(createElement(StreamingText, { content: "600 pieces" }));
  assert.ok(!complete.includes("Receiving transcript"));
});
test("public tool failure state excludes private voice credentials and signatures", () => {
  const result = publicProgress({ running: false, failed: true, operation: "Evaluate order", at: "2026-11-21", _llmToolMetadata: { private: "opaque-signature" }, _submissionCalls: { key: "private-grant" } });
  assert.deepEqual(result, { running: false, failed: true, operation: "Evaluate order", at: "2026-11-21" });
});
