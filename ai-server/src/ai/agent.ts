import OpenAI from "openai";
import { AGENT_TOOLS, ChatMessage, ContentPart, streamChat, ToolDef } from "./client.js";
import { AppConfig, Provider } from "./config.js";
import { beginSession } from "./history.js";
import { buildSystemPrompt, buildUserMessage, PromptContext } from "./prompts.js";
import { executeTool, ToolImage } from "./tools.js";

export type AgentEvent =
  | { type: "plan"; runId: string; steps: Array<{ id: string; label: string }> }
  | { type: "phase"; id: string; label: string; status: "start" | "done" | "error"; detail?: string }
  | { type: "reasoning"; content: string }
  | { type: "text"; content: string }
  | { type: "tool_start"; id: string; name: string; label: string; args: any }
  | { type: "tool_result"; id: string; name: string; label: string; ok: boolean; text: string; image?: ToolImage }
  | { type: "image"; image: ToolImage; label: string }
  | { type: "usage"; promptTokens?: number; completionTokens?: number; totalTokens?: number }
  | { type: "error"; content: string }
  | { type: "done"; runId: string; timeMs: number; tokens: number; changed: boolean; verified: boolean; steps: number };

export interface RunOptions {
  cfg: AppConfig;
  provider: Provider;
  model: string;
  sessionId: string;
  message: string;
  context: PromptContext;
  send: (e: AgentEvent) => void;
  signal: AbortSignal;
}

interface SessionState {
  messages: ChatMessage[];
  lastActive: number;
}

const sessions = new Map<string, SessionState>();
const MAX_HISTORY = 24;

const PHASES = [
  { id: "understand", label: "理解需求" },
  { id: "inspect", label: "读取界面" },
  { id: "edit", label: "修改界面" },
  { id: "verify", label: "验证布局" },
  { id: "report", label: "汇报结果" },
];

const TOOL_LABELS: Record<string, string> = {
  ui_read: "读取界面文件",
  ui_selection: "读取选中控件",
  ui_set_property: "设置控件属性",
  ui_edit: "编辑控件",
  ui_add_widget: "添加控件",
  ui_remove_widget: "删除控件",
  ui_check_layout: "检查布局遮挡",
  ui_screenshot: "截取界面画面",
  ui_history: "查看修改历史",
  ui_revert: "回退版本",
};

const TOOL_PHASE: Record<string, string> = {
  ui_read: "inspect",
  ui_selection: "inspect",
  ui_check_layout: "verify",
  ui_screenshot: "verify",
  ui_history: "inspect",
  ui_set_property: "edit",
  ui_edit: "edit",
  ui_add_widget: "edit",
  ui_remove_widget: "edit",
  ui_revert: "edit",
};

export function getSession(sessionId: string): SessionState {
  let s = sessions.get(sessionId);
  if (!s) {
    s = { messages: [], lastActive: Date.now() };
    sessions.set(sessionId, s);
  }
  s.lastActive = Date.now();
  return s;
}

export function clearSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export async function runAgent(opts: RunOptions): Promise<void> {
  const { cfg, provider, model, sessionId, message, context, send, signal } = opts;
  const start = Date.now();
  const runId = `${sessionId}-${Date.now().toString(36)}`;
  const state = getSession(sessionId);
  const filePath = context.uiFilePath || "";
  let changed = false;
  let verified = false;
  let steps = 0;
  let tokens = 0;
  const sessionSnapshot = filePath ? beginSession(filePath, runId) : null;

  send({ type: "plan", runId, steps: PHASES });
  send({ type: "phase", id: "understand", label: "理解需求", status: "start" });

  const system = buildSystemPrompt(context);
  const user = buildUserMessage(message, context);
  const messages: ChatMessage[] = [{ role: "system", content: system }];

  // 保留最近历史，丢弃图片以控制体积
  const history = state.messages.slice(-MAX_HISTORY).map(m => stripImages(m));
  messages.push(...history);
  messages.push({ role: "user", content: user });

  send({ type: "phase", id: "understand", label: "理解需求", status: "done" });

  let textOnlyTurns = 0;

  try {
    for (let step = 0; step < cfg.agent.maxSteps; step++) {
      if (signal.aborted) break;
      steps++;
      send({ type: "phase", id: "inspect", label: "读取界面", status: "start" });

      const assistant = await streamChat(
        provider,
        model,
        messages,
        AGENT_TOOLS as ToolDef[],
        cfg.agent,
        (ev) => {
          if (ev.type === "reasoning" && cfg.agent.showReasoning) send({ type: "reasoning", content: ev.content });
          else if (ev.type === "text") send({ type: "text", content: ev.content });
        },
        signal
      );
      tokens += assistant.usage?.total_tokens || 0;
      if (assistant.usage) {
        send({
          type: "usage",
          promptTokens: assistant.usage.prompt_tokens,
          completionTokens: assistant.usage.completion_tokens,
          totalTokens: assistant.usage.total_tokens,
        });
      }
      messages.push(assistant);
      if (!assistant.reasoning_content && cfg.agent.showReasoning && typeof assistant.content === "string" && !assistant.tool_calls) {
        // 没有原生推理的模型，用最终回答之前的文本作为过程提示
      }

      const calls = assistant.tool_calls || [];
      if (calls.length === 0) {
        textOnlyTurns++;
        if (changed && !verified && textOnlyTurns <= 1) {
          send({ type: "phase", id: "verify", label: "修改后验证", status: "start", detail: "Agent 正在补做验证" });
          messages.push({
            role: "user",
            content: "你刚才已经修改了文件，但还没有验证。必须调用 ui_check_layout 和 ui_screenshot，确认没有遮挡、越界或尺寸问题后再结束。",
          });
          continue;
        }
        break;
      }

      textOnlyTurns = 0;
      const images: ToolImage[] = [];

      for (const tc of calls) {
        if (signal.aborted) break;
        const name = tc.function.name;
        const label = TOOL_LABELS[name] || name;
        send({ type: "tool_start", id: tc.id, name, label, args: safeParse(tc.function.arguments) });
        const phaseId = TOOL_PHASE[name] || "inspect";
        send({ type: "phase", id: phaseId, label: phaseLabel(phaseId), status: "start", detail: label });

        const result = await executeTool(name, tc.function.arguments, {
          filePath,
          selectedElement: context.selectedElement,
          sessionId: runId,
        });

        let text = result.text;
        if (result.changed) {
          changed = true;
          verified = false;
        }
        if ((name === "ui_check_layout" || name === "ui_screenshot") && result.ok) {
          verified = true;
        }

        if (result.image) {
          images.push(result.image);
          send({ type: "image", image: result.image, label });
          const visual = await describeImage(provider, result.image.url);
          if (visual) text += `\n\n视觉模型观察：${visual}`;
        }

        const capped = text.length > 9000 ? text.slice(0, 9000) + "\n...(已截断)" : text;
        send({
          type: "tool_result", id: tc.id, name, label,
          ok: result.ok, text: capped, image: result.image,
        });
        messages.push({ role: "tool", tool_call_id: tc.id, content: capped });

        send({ type: "phase", id: phaseId, label: phaseLabel(phaseId), status: result.ok ? "done" : "error", detail: label });
      }

      // 主模型本身支持视觉时，把截图作为用户消息附上
      if (images.length && provider.supportsVision) {
        const parts: ContentPart[] = [{
          type: "text",
          text: "这是当前设计器的截图。请观察实际渲染效果，检查是否存在遮挡、错位、裁剪，并决定是否继续修改。",
        }];
        for (const img of images.slice(0, 2)) {
          parts.push({ type: "image_url", image_url: { url: img.url } });
        }
        messages.push({ role: "user", content: parts });
      } else {
        messages.push({
          role: "user",
          content: changed
            ? "继续。若修改完成，请确认验证结果并简要汇报。"
            : "继续判断是否需要修改；不需要修改就直接回答。",
        });
      }
    }

    // 最后兜底跑一次静态检查，避免 Agent 忘记验证
    if (filePath && changed) {
      const check = await executeTool("ui_check_layout", "{}", {
        filePath, selectedElement: context.selectedElement, sessionId: runId,
      });
      send({
        type: "tool_result", id: "final-check", name: "ui_check_layout", label: "最终布局检查",
        ok: check.ok, text: check.text,
      });
      if (check.ok) verified = true;
    }

    send({ type: "phase", id: "report", label: "汇报结果", status: "start" });

    // 只保留非 system 消息作为后续上下文，并控制长度
    state.messages = messages.filter(m => m.role !== "system").slice(-MAX_HISTORY);

    send({ type: "phase", id: "report", label: "汇报结果", status: "done" });
    send({
      type: "done",
      runId,
      timeMs: Date.now() - start,
      tokens,
      changed,
      verified,
      steps,
    });
    if (sessionSnapshot) {
      // 快照已经写入 index，前端可用 runId 回退本次
    }
  } catch (err) {
    if (signal.aborted) {
      send({ type: "error", content: "已停止生成" });
    } else {
      send({ type: "error", content: err instanceof Error ? err.message : String(err) });
    }
  }
}

function phaseLabel(id: string): string {
  const map: Record<string, string> = {
    understand: "理解需求",
    inspect: "读取界面",
    "verify-before": "视觉检查",
    edit: "修改界面",
    verify: "修改后验证",
    report: "汇报结果",
  };
  return map[id] || id;
}

function safeParse(s: string): any {
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}

function stripImages(m: ChatMessage): ChatMessage {
  if (typeof m.content === "string") return m;
  const text = m.content.filter((p): p is { type: "text"; text: string } => p.type === "text").map(p => p.text).join("\n");
  return { ...m, content: text };
}

async function describeImage(provider: Provider, url: string): Promise<string | null> {
  const vm = (provider.visionModel || "").trim();
  if (!vm) return null;
  try {
    const client = new OpenAI({ apiKey: provider.apiKey, baseURL: provider.baseURL });
    const res = await client.chat.completions.create({
      model: vm,
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: "这是 Qt Designer 的界面截图。请客观描述：1) 整体布局；2) 控件是否重叠、被遮挡、超出容器、明显错位；3) 只报告可见事实，200 字以内。",
          },
          { type: "image_url", image_url: { url } },
        ] as any,
      }],
      max_tokens: 500,
      temperature: 0.2,
    });
    return res.choices[0]?.message?.content || null;
  } catch (err) {
    return `视觉模型调用失败：${err instanceof Error ? err.message : String(err)}`;
  }
}
