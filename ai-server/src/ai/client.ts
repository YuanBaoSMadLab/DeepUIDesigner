import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export interface AiConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

export function loadConfig(): AiConfig {
  const apiKey = process.env.API_KEY || process.env.DEEPSEEK_API_KEY || "";
  const baseURL = process.env.BASE_URL || "https://api.deepseek.com";
  const model = process.env.MODEL || "deepseek-v4-flash";
  return { apiKey, baseURL, model };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  /** V4 thinking 模式必须回传，空字符串表示无推理内容 */
  reasoning_content?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type StreamEvent =
  | { type: "text"; content: string }
  | { type: "done" };

export type StreamCallback = (event: StreamEvent) => void;

// ---- Tool definitions ----
export const UI_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "ui_read",
      description: "Read the current .UI file XML content. ALWAYS call this first to see what's in the file before making edits.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "ui_edit",
      description: "Edit text within a single named widget in the .UI file. Finds old_string EXACTLY inside that widget's XML block and replaces it with new_string. The old_string must be copied verbatim from ui_read output — preserve all whitespace, indentation, and line endings. Only use this for targeted changes to one widget.",
      parameters: {
        type: "object",
        properties: {
          widget_name: {
            type: "string",
            description: "The widget's name attribute value from the .UI file, e.g. 'okButton' or 'nameInput'. Must match exactly.",
          },
          old_string: {
            type: "string",
            description: "EXACT text to find inside the named widget's XML block. Copy VERBATIM from ui_read output. CRITICAL: old_string MUST be fully contained within the target widget's <widget>...</widget> block. Never include the widget's own opening/closing tags or any part of parent <layout>/<item> tags. If the widget is inside a layout, keep the layout's <item> wrapper untouched.",
          },
          new_string: {
            type: "string",
            description: "Replacement text. Must be valid .UI XML using same indentation as old_string. Follow Qt .UI format: <string> for text, <bool>true/false</bool> for booleans, <number> for numbers, <set>Qt::EnumName</set> for enums, <rect><x>0</x>... for geometry. Qt enums MUST have 'Qt::' prefix. CRITICAL: never alter parent <layout>, <item>, or sibling widgets. Only edit inside the target widget's <widget> block.",
          },
        },
        required: ["widget_name", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "ui_write",
      description: "Write complete XML content to the .UI file, replacing the entire file. Use only for full rewrites or new file creation. Creates a backup before writing.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: `Complete .UI XML content. MUST follow Qt .UI file format EXACTLY:

Widget structure:
  <widget class="QClassName" name="objectName">
    <property name="propertyName">
      <TYPE>value</TYPE>
    </property>
  </widget>

Property TYPE tags (use the CORRECT tag for each type):
  text              → <string>Hello</string>
  bool/enabled      → <bool>true</bool> or <bool>false</bool>
  numbers           → <number>42</number>
  Qt enums          → <set>Qt::EnumName</set>       ← NEVER use <enum>
  geometry/rect     → <rect><x>0</x><y>0</y><width>100</width><height>30</height></rect>
                       ← NEVER comma-separated: "0,0,100,30"
  sizes             → <size><width>100</width><height>30</height></size>
  fonts             → <font><pointsize>12</pointsize><bold>true</bold></font>
  colors            → <color><red>255</red><green>0</green><blue>0</blue></color>

FORBIDDEN — will cause Designer load errors:
  ✗ align as widget attribute     → use <property name="alignment"><set>Qt::AlignCenter</set>
  ✗ <enum> tag                    → use <set> for all Qt enums
  ✗ Qt enums without Qt:: prefix  → Qt::AlignCenter NOT AlignCenter
  ✗ comma rect: "0,0,100,30"     → use <rect> child elements
  ✗ widget attributes besides class and name
  ✗ made-up property names        → only real Qt properties

Layout margin properties: leftMargin, topMargin, rightMargin, bottomMargin (NOT "margin")
Layout structure: <layout class="QVBoxLayout" name="layoutName"><item>...</item></layout>
Shell: <?xml version="1.0" encoding="UTF-8"?><ui version="4.0">...<resources/>...</ui>

Before calling ui_write, call ui_read first to understand the existing file structure.`,
          },
        },
        required: ["content"],
      },
    },
  },
];

/** 内部 ChatMessage 转 OpenAI SDK 格式，assistant 消息要带上 reasoning_content（V4 必填，空串也行） */
export function toOpenAIMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
  return messages.map((m) => {
    const base: Record<string, unknown> = {
      role: m.role,
      content: m.content,
    };
    if (m.tool_call_id) base.tool_call_id = m.tool_call_id;
    if (m.tool_calls) base.tool_calls = m.tool_calls;
    // V4 thinking 模式：assistant 消息必须带 reasoning_content（空字符串亦可）
    if (m.role === "assistant") {
      base.reasoning_content = m.reasoning_content || "";
    }
    return base as unknown as ChatCompletionMessageParam;
  });
}

/** 带日志的流式对话，支持 DeepSeek V4 thinking 模式 */
export async function streamChat(
  config: AiConfig,
  messages: ChatMessage[],
  onChunk: StreamCallback
): Promise<ChatMessage> {
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });

  const request: Record<string, unknown> = {
    model: config.model,
    messages: toOpenAIMessages(messages),
    tools: UI_TOOLS,
    tool_choice: "auto",
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: 32768,
  };

  console.log(`[AI] Calling ${config.model} @ ${config.baseURL} (tools=${UI_TOOLS.length}, msgs=${messages.length})`);

  let stream: any;
  try {
    stream = await client.chat.completions.create(request as any);
  } catch (err: any) {
    console.error(`[AI] API call failed: ${err.message || err}`);
    if (err.status) console.error(`[AI] HTTP status: ${err.status}, body: ${JSON.stringify(err.error || err.body || {}).substring(0, 500)}`);
    throw err;
  }

  let content = "";
  let reasoningContent = "";
  const toolCallsByIndex = new Map<number, {
    id?: string; type?: string; function?: { name?: string; arguments?: string };
  }>();

  try {
    for await (const chunk of stream as any) {
      const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
      for (const choice of choices) {
        const delta = choice?.delta;
        if (!delta) continue;

        // 捕获 reasoning_content（V4 thinking 模式）
        if (typeof delta.reasoning_content === "string") {
          reasoningContent += delta.reasoning_content;
        }

        // 只把 content 推给前端，reasoning_content 留内部用（思考过程不展示）
        if (typeof delta.content === "string") {
          content += delta.content;
          onChunk({ type: "text", content: delta.content });
        }

        const rawToolCalls = delta.tool_calls;
        if (Array.isArray(rawToolCalls)) {
          for (const tc of rawToolCalls) {
            if (!tc || typeof tc !== "object") continue;
            const index = typeof tc.index === "number" ? tc.index : toolCallsByIndex.size;
            const current = toolCallsByIndex.get(index) || {};
            if (typeof tc.id === "string") current.id = tc.id;
            if (typeof tc.type === "string") current.type = tc.type;
            if (tc.function && typeof tc.function === "object") {
              current.function = current.function || {};
              if (typeof tc.function.name === "string") current.function.name = (current.function.name || "") + tc.function.name;
              if (typeof tc.function.arguments === "string") current.function.arguments = (current.function.arguments || "") + tc.function.arguments;
            }
            toolCallsByIndex.set(index, current);
          }
        }
      }
    }
  } catch (err: any) {
    console.error(`[AI] Stream error: ${err.message || err}`);
    throw err;
  }

  onChunk({ type: "done" });

  const toolCalls: ToolCall[] = Array.from(toolCallsByIndex.entries())
    .sort(([a], [b]) => a - b)
    .map(([, tc]) => ({
      id: tc.id || "",
      type: "function" as const,
      function: { name: tc.function?.name || "", arguments: tc.function?.arguments || "" },
    }));

  console.log(`[AI] Done: content_len=${content.length}, reasoning_len=${reasoningContent.length}, tool_calls=${toolCalls.length}`);

  return {
    role: "assistant",
    content,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    reasoning_content: reasoningContent,
  };
}
