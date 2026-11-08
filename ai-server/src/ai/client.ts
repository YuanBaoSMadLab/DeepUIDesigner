import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { AgentOptions, Provider } from "./config.js";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  reasoning_content?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type StreamEvent =
  | { type: "text"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "done" };

export type StreamCallback = (event: StreamEvent) => void;

export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

const P = (description: string, type = "string", extra: Record<string, unknown> = {}) => ({
  type,
  description,
  ...extra,
});

export const AGENT_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "ui_read",
      description: "读取当前 .ui 文件。可传 widget 名只看某一块。修改前必须先读。",
      parameters: {
        type: "object",
        properties: {
          widget: P("可选。只读取该控件及其子控件的 XML 片段"),
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ui_selection",
      description: "读取设计器里当前选中的控件（用户指向的目标）。",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "ui_set_property",
      description: "设置某个控件的一个属性，自动替换或新增。适合 text/geometry/styleSheet/enabled 等简单属性。",
      parameters: {
        type: "object",
        properties: {
          widget: P("控件 objectName，例如 btnOk"),
          property: P("属性名，例如 text、geometry、styleSheet、enabled"),
          value: P("属性值。geometry 用 x,y,w,h；bool 用 true/false；其余按 string 处理"),
          kind: P("值类型：string | number | bool | rect | raw", "string", {
            enum: ["string", "number", "bool", "rect", "raw"],
          }),
        },
        required: ["widget", "property", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ui_edit",
      description: "在指定控件内部做精确文本替换。old_string 必须来自 ui_read 的结果。适合复杂属性或补丁。",
      parameters: {
        type: "object",
        properties: {
          widget: P("控件 objectName"),
          old_string: P("要替换的原文，必须唯一"),
          new_string: P("替换后的文本"),
        },
        required: ["widget", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ui_add_widget",
      description: "在指定父控件末尾插入一个新的完整 widget XML。父控件可以是 QWidget、QGroupBox、layout 容器等。",
      parameters: {
        type: "object",
        properties: {
          parent: P("父控件 objectName"),
          xml: P("完整的 <widget ...>...</widget> XML 片段"),
        },
        required: ["parent", "xml"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ui_remove_widget",
      description: "删除指定控件及其子控件。",
      parameters: {
        type: "object",
        properties: { widget: P("控件 objectName") },
        required: ["widget"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ui_check_layout",
      description: "静态检查布局问题：控件重叠/遮挡、超出父容器、尺寸为 0、固定尺寸布局等。修改后必须调用。",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "ui_screenshot",
      description: "截取设计师窗口的可视化画面，用于确认实际渲染效果和遮挡情况。修改前后都应调用。",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "ui_history",
      description: "查看当前文件的修改历史（可回退版本）。",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "ui_revert",
      description: "回退到某个历史版本。不传 revision 时回退到上一次修改前。",
      parameters: {
        type: "object",
        properties: {
          revision: P("历史版本 id，可先用 ui_history 查看"),
        },
      },
    },
  },
];

export interface StreamResult extends ChatMessage {
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

/** 统一处理 OpenAI 兼容接口的流式输出，额外解析 reasoning_content */
export async function streamChat(
  provider: Provider,
  model: string,
  messages: ChatMessage[],
  tools: ToolDef[],
  opts: AgentOptions,
  onEvent: StreamCallback,
  signal?: AbortSignal
): Promise<StreamResult> {
  const client = new OpenAI({ apiKey: provider.apiKey, baseURL: provider.baseURL });
  const stream = await createStreamCompat(client, {
    model,
    messages: messages as unknown as ChatCompletionMessageParam[],
    tools: tools as any,
    tool_choice: "auto",
    stream: true,
    stream_options: { include_usage: true },
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
  }, signal);

  let content = "";
  let reasoning = "";
  let usage: StreamResult["usage"];
  const toolByIndex = new Map<number, { id?: string; name?: string; args?: string }>();

  for await (const chunk of stream as any) {
    if (chunk?.usage) usage = chunk.usage;
    const choices = Array.isArray(chunk?.choices) ? chunk.choices : [];
    for (const choice of choices) {
      const delta = choice?.delta;
      if (!delta) continue;

      const r = extractReasoning(delta);
      if (r) {
        reasoning += r;
        onEvent({ type: "reasoning", content: r });
      }

      const text = extractText(delta);
      if (text) {
        content += text;
        onEvent({ type: "text", content: text });
      }

      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          if (!tc || typeof tc !== "object") continue;
          const index = typeof tc.index === "number" ? tc.index : toolByIndex.size;
          const cur = toolByIndex.get(index) || {};
          if (typeof tc.id === "string") cur.id = tc.id;
          if (tc.function) {
            if (typeof tc.function.name === "string") cur.name = (cur.name || "") + tc.function.name;
            if (typeof tc.function.arguments === "string") cur.args = (cur.args || "") + tc.function.arguments;
          }
          toolByIndex.set(index, cur);
        }
      }
    }
  }

  onEvent({ type: "done" });

  const tool_calls: ToolCall[] = Array.from(toolByIndex.entries())
    .sort(([a], [b]) => a - b)
    .map(([, tc]) => ({
      id: tc.id || `call_${Math.random().toString(36).slice(2)}`,
      type: "function" as const,
      function: { name: tc.name || "", arguments: tc.args || "{}" },
    }));

  return {
    role: "assistant",
    content,
    tool_calls: tool_calls.length ? tool_calls : undefined,
    reasoning_content: reasoning || undefined,
    usage,
  };
}

/**
 * 兼容不同服务商的流式建连参数：
 * - max_tokens → max_completion_tokens（OpenAI 新模型）
 * - 部分推理模型拒绝 temperature
 * - 部分兼容实现不支持 stream_options
 * 只在明确的 400/422 参数错误时降级重试一次，不会重复计费成功请求。
 */
async function createStreamCompat(client: OpenAI, params: any, signal?: AbortSignal): Promise<any> {
  let current: any = { ...params };
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await client.chat.completions.create(current, { signal });
    } catch (err: any) {
      lastErr = err;
      const status = err?.status;
      const msg = String(err?.message || err?.error?.message || "");
      const paramError = status === 400 || status === 422 ||
        /unsupported|not supported|unrecognized|unknown parameter|invalid parameter/i.test(msg);
      if (!paramError) throw err;

      if (current.max_tokens !== undefined && /max_tokens|max_completion_tokens/i.test(msg)) {
        current = { ...current, max_completion_tokens: current.max_tokens };
        delete current.max_tokens;
        continue;
      }
      if (current.temperature !== undefined && /temperature/i.test(msg)) {
        current = { ...current };
        delete current.temperature;
        continue;
      }
      if (current.stream_options !== undefined && /stream_options/i.test(msg)) {
        current = { ...current };
        delete current.stream_options;
        continue;
      }
      if (current.tool_choice !== undefined && /tool_choice/i.test(msg)) {
        current = { ...current };
        delete current.tool_choice;
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/** 推理内容字段在不同服务商下命名不同 */
function extractReasoning(delta: any): string {
  const candidates = [
    delta.reasoning_content,
    delta.reasoning,
    delta.thinking,
    delta.reasoning_text,
  ];
  for (const v of candidates) {
    if (typeof v === "string" && v) return v;
    if (v && typeof v === "object" && typeof v.text === "string" && v.text) return v.text;
  }
  if (Array.isArray(delta.reasoning_details)) {
    return delta.reasoning_details.map((d: any) => d?.text).filter(Boolean).join("");
  }
  return "";
}

/** 正文既可能是字符串，也可能是 content parts 数组 */
function extractText(delta: any): string {
  if (typeof delta.content === "string" && delta.content) return delta.content;
  if (Array.isArray(delta.content)) {
    return delta.content
      .map((part: any) => (typeof part === "string" ? part : part?.type === "text" ? part.text : ""))
      .filter(Boolean)
      .join("");
  }
  return "";
}

/** 从消息里取纯文本，便于日志/摘要 */
export function messageText(m: ChatMessage): string {
  if (typeof m.content === "string") return m.content;
  return m.content.filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map(p => p.text)
    .join("\n");
}
