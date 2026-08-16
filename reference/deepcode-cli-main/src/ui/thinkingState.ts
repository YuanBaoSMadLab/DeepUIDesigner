import type { SessionMessage } from "../session";

/**
 * Returns the message id of the assistant "thinking" message that should stay
 * expanded — i.e. the most recent thinking message after the most recent
 * non-thinking assistant message. Mirrors the VS Code extension's bubble
 * collapse logic: at most one thinking bubble is open, and it is closed once a
 * regular assistant reply arrives.
 */
export function findExpandedThinkingId(messages: SessionMessage[]): string | null {
  let expanded: string | null = null;
  for (const message of messages) {
    if (message.role !== "assistant") {
      continue;
    }
    if (message.meta?.asThinking) {
      expanded = message.id;
    } else {
      expanded = null;
    }
  }
  return expanded;
}
