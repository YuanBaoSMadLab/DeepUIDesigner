import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExitSummaryText } from "../ui";
import type { SessionEntry, SessionMessage } from "../session";

const stripAnsi = (text: string): string => text.replace(/\u001b\[[0-9;]*m/g, "");

test("buildExitSummaryText only shows Goodbye and model usage with cached tokens", () => {
  const summary = stripAnsi(
    buildExitSummaryText({
      session: buildSession({
        prompt_tokens: 11_966,
        completion_tokens: 236,
        total_tokens: 12_202,
        prompt_tokens_details: { cached_tokens: 11_776 },
        completion_tokens_details: { reasoning_tokens: 144 },
      }),
      messages: [buildAssistantMessage("assistant-1"), buildAssistantMessage("assistant-2")],
      model: "mimo-v2.5-pro",
    })
  );

  assert.match(summary, /Goodbye!/);
  assert.match(summary, /╭─+╮/);
  assert.match(summary, /╰─+╯/);
  assert.match(summary, /Model Usage/);
  assert.match(summary, /Cached Tokens/);
  assert.match(summary, /mimo-v2\.5-pro\s+2\s+11,966\s+236\s+11,776/);
  assert.doesNotMatch(summary, /Agent powering down/);
  assert.doesNotMatch(summary, /Interaction Summary/);
  assert.doesNotMatch(summary, /Context Window/);
  assert.doesNotMatch(summary, /Savings Highlight/);
  assert.doesNotMatch(summary, /Reasoning Tokens/);
});

function buildSession(usage: unknown): SessionEntry {
  return {
    id: "session-1",
    summary: null,
    assistantReply: null,
    assistantThinking: null,
    assistantRefusal: null,
    toolCalls: null,
    status: "completed",
    failReason: null,
    usage,
    activeTokens: 0,
    createTime: "2026-01-01T00:00:00.000Z",
    updateTime: "2026-01-01T00:00:01.000Z",
    processes: null,
  };
}

function buildAssistantMessage(id: string): SessionMessage {
  return {
    id,
    sessionId: "session-1",
    role: "assistant",
    content: "",
    contentParams: null,
    messageParams: null,
    compacted: false,
    visible: true,
    createTime: "2026-01-01T00:00:00.000Z",
    updateTime: "2026-01-01T00:00:00.000Z",
  };
}
