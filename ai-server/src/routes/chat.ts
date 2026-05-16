import { Router, Request, Response } from "express";
import { loadConfig, streamChat, type ChatMessage, type ToolCall } from "../ai/client.js";
import { buildSystemPrompt, buildUserMessage, type PromptContext } from "../ai/prompts.js";
import { applyEdit, readUiFile, writeUiFile, createBackup, createPreChatBackup } from "../ai/ui-tools.js";

const router = Router();

// 从 XML 中快速提取控件名称用于摘要
function extractElementName(xml: string): string {
  const classMatch = xml.match(/class="([^"]+)"/);
  const nameMatch = xml.match(/name="([^"]+)"/);
  const textMatch = xml.match(/<property name="text">\s*<string>([^<]*)<\/string>/);
  const cls = classMatch ? classMatch[1] : "widget";
  const name = nameMatch ? nameMatch[1] : "";
  const text = textMatch ? textMatch[1] : "";
  if (name && text) return `${cls} "${name}" (${text})`;
  if (name) return `${cls} "${name}"`;
  if (text) return `${cls} (${text})`;
  return cls;
}

// ---- 分层上下文管理 ----
interface ContextLayer {
  /** 固定层：system prompt，永远保留 */
  system: string;
  /** 项目摘要：文件路径、选中元素等，定期刷新 */
  projectSummary: string;
  /** 工作层：用户消息 + AI 响应 + 工具调用 */
  working: ChatMessage[];
  /** 压缩层：最近一次 compaction 的摘要 */
  compacted: string | null;
  /** 持久层：跨多次 compaction 累积的关键信息，永不丢失 */
  persistentSummary: string;
  /** 上次注入项目摘要的回合 */
  lastSummaryTurn: number;
  /** 用户的首条消息（任务目标），永远保留 */
  initialGoal: string;
}

const sessions = new Map<string, ContextLayer>();
// 记录每个 session 的最后活跃时间戳，用于自动清理
const sessionLastActive = new Map<string, number>();
// 30 分钟未活动自动清理
const SESSION_TTL_MS = 30 * 60 * 1000;
// 每 5 分钟执行一次清理
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// 定期清理过期会话
setInterval(() => {
  const now = Date.now();
  for (const [key, lastActive] of sessionLastActive) {
    if (now - lastActive > SESSION_TTL_MS) {
      sessions.delete(key);
      sessionLastActive.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS).unref(); // unref 让定时器不阻塞进程退出

// 每 N 轮工具调用后，重新注入项目上下文防止失真
const REINJECT_INTERVAL = 5;
// 上下文软上限（DeepSeek 1M，留余量）
const TOKEN_SOFT_LIMIT = 800_000;

function estimateTokens(text: string): number {
  let t = 0;
  for (const c of text) t += /[\u3400-\u9fff]/.test(c) ? 0.6 : 0.3;
  return Math.round(t);
}

function getLayer(key: string): ContextLayer {
  sessionLastActive.set(key, Date.now());
  if (!sessions.has(key)) {
    sessions.set(key, {
      system: "",
      projectSummary: "",
      working: [],
      compacted: null,
      persistentSummary: "",
      lastSummaryTurn: 0,
      initialGoal: "",
    });
  }
  return sessions.get(key)!;
}


function executeTool(tc: ToolCall, filePath: string): string {
  let args: Record<string, string>;
  try {
    args = JSON.parse(tc.function.arguments || "{}");
  } catch {
    return "FAIL: Tool call arguments are invalid JSON (likely truncated by token limit). Use ui_edit for targeted changes instead of ui_write for entire file. Retry with smaller operation.";
  }
  try {
    switch (tc.function.name) {
      case "ui_read": return readUiFile(filePath);
      case "ui_edit": {
        createBackup(filePath);
        const r = applyEdit(filePath, args.widget_name, args.old_string, args.new_string);
        return r.success ? "OK: " + (r.message || "modified") : "FAIL: " + (r.error || "unknown");
      }
      case "ui_write": {
        createBackup(filePath);
        const r = writeUiFile(filePath, args.content);
        return r.success ? "OK: file written" : "FAIL: " + (r.error || "unknown");
      }
      default: return "Unknown tool: " + tc.function.name;
    }
  } catch (err) { return "Error: " + String(err); }
}

function sse(res: Response, data: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/** 压缩工作层：将旧消息替换为摘要，保留最新的 N 对工具调用。
 *  关键：旧消息不会丢弃，而是累积到 persistentSummary 中永久保留。 */
function compactLayer(layer: ContextLayer): void {
  const msgs = layer.working;
  if (msgs.length < 6) return;

  // 保留最后 3 个 user/assistant 对
  let keepFrom = msgs.length;
  let userCount = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "user") {
      userCount++;
      if (userCount >= 3) { keepFrom = i; break; }
    }
  }

  const old = msgs.slice(0, keepFrom);
  const recent = msgs.slice(keepFrom);

  if (old.length === 0) return;

  // 生成高质量摘要：包含工具调用结果，而非仅仅工具名
  const actions: string[] = [];
  for (const m of old) {
    if (m.role === "user") {
      actions.push(`用户要求: ${m.content.substring(0, 200)}`);
    } else if (m.role === "assistant") {
      const parts: string[] = [];
      if (m.content?.trim()) {
        parts.push(`回复: ${m.content.substring(0, 150)}`);
      }
      if (m.tool_calls?.length) {
        parts.push(`调用工具: ${m.tool_calls.map(t => t.function.name).join(",")}`);
      }
      if (parts.length) actions.push(parts.join(" | "));
    } else if (m.role === "tool") {
      // 工具结果：记录成功/失败
      const short = m.content.substring(0, 120);
      actions.push(`结果: ${short}`);
    }
  }

  const newCompact = `[历史摘要: ${actions.join(" → ")}]`;

  // 累积到持久层：旧的 persistentSummary + 新的 compact 合并
  if (layer.persistentSummary) {
    layer.persistentSummary = `${layer.persistentSummary}\n${newCompact}`;
  } else {
    layer.persistentSummary = newCompact;
  }

  // 限制持久层大小（保留最近 3000 字符），防止无限膨胀
  if (layer.persistentSummary.length > 3000) {
    layer.persistentSummary = "...(earlier)\n" + layer.persistentSummary.slice(-2800);
  }

  // compacted 只存最近一次压缩的摘要（用于快速注入）
  layer.compacted = newCompact;
  layer.working = recent;
}

router.post("/", async (req: Request, res: Response) => {
  const { message, context, sessionId } = req.body as {
    message: string; context: PromptContext; sessionId?: string;
  };

  if (!message) { res.status(400).json({ error: "Missing message" }); return; }
  const config = loadConfig();
  if (!config.apiKey) { res.status(500).json({ error: "No API_KEY" }); return; }

  const filePath = context?.uiFilePath || "";
  // 对话前自动备份：无论 AI 做什么修改，用户都可以一键回到现在这个状态
  createPreChatBackup(filePath);
  const key = sessionId || "default";
  const startTime = Date.now();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const layer = getLayer(key);
    const systemPrompt = buildSystemPrompt(context);
    const userPrompt = buildUserMessage(message, context);

    // 更新固定层
    layer.system = systemPrompt;
    // 注入/更新项目摘要
    const selSummary = context.selectedElement
      ? extractElementName(context.selectedElement)
      : "none";
    const summary = filePath
      ? `Current file: ${filePath}. Selected: ${selSummary}.`
      : "No file bound.";
    layer.projectSummary = summary;

    // 记录首条消息作为任务目标（永不丢失）
    if (!layer.initialGoal && message.trim()) {
      layer.initialGoal = message.substring(0, 300);
    }

    // 构建消息：system + initial goal + persistent + compacted + project + working + 本次消息
    const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }];

    // 注入初始任务目标（永不压缩淘汰）
    if (layer.initialGoal) {
      messages.push({
        role: "system",
        content: `[任务目标] ${layer.initialGoal}`,
      });
    }

    // 注入持久摘要（跨 compaction 累积的关键历史）
    if (layer.persistentSummary) {
      messages.push({
        role: "system",
        content: `[操作历史] ${layer.persistentSummary}`,
      });
    }

    if (layer.compacted) {
      messages.push({
        role: "system",
        content: `[最近操作] ${layer.compacted}`,
      });
    }

    // 定期重新注入项目上下文
    layer.lastSummaryTurn++;
    if (layer.lastSummaryTurn >= REINJECT_INTERVAL) {
      layer.lastSummaryTurn = 0;
      messages.push({
        role: "system",
        content: `Project status: ${layer.projectSummary}`,
      });
    }

    messages.push(...layer.working);
    messages.push({ role: "user", content: userPrompt });

    // Token 估算
    let totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    if (totalTokens > TOKEN_SOFT_LIMIT) {
      compactLayer(layer);
      // 用压缩后的重建，同样注入持久层和目标
      messages.length = 0;
      messages.push({ role: "system", content: systemPrompt });
      if (layer.initialGoal) {
        messages.push({ role: "system", content: `[任务目标] ${layer.initialGoal}` });
      }
      if (layer.persistentSummary) {
        messages.push({ role: "system", content: `[操作历史] ${layer.persistentSummary}` });
      }
      if (layer.compacted) messages.push({ role: "system", content: `[最近操作] ${layer.compacted}` });
      messages.push(...layer.working);
      messages.push({ role: "user", content: userPrompt });
      totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    }

    let fullResponse = "";
    let textOnlyTurns = 0;
    const turnMessages: ChatMessage[] = [];

    sse(res, { type: "status", status: "thinking", ms: Date.now() - startTime, tokens: totalTokens });

    for (let turn = 0; turn < 5; turn++) {
      const assistantMsg = await streamChat(config, messages, (event) => {
        if (event.type === "text") {
          fullResponse += event.content;
          sse(res, { type: "text", content: event.content });
        }
      });

      messages.push(assistantMsg);
      turnMessages.push(assistantMsg);

      const toolCalls = assistantMsg.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        textOnlyTurns++;
        if (textOnlyTurns >= 2) {
          messages.push({
            role: "user",
            content: "MUST call tools to make changes. Call ui_read first, then ui_edit/ui_write.",
          });
          sse(res, { type: "status", status: "forcing_tools" });
          continue;
        }
        break;
      }

      textOnlyTurns = 0;
      const toolNames = toolCalls.map(t => t.function.name).join(",");
      sse(res, { type: "status", status: `tools:${toolNames}`, turn });

      for (const tc of toolCalls) {
        const result = executeTool(tc, filePath);
        sse(res, { type: "tool", name: tc.function.name, ok: result.startsWith("OK:") });
        const toolMsg = {
          role: "tool" as const,
          tool_call_id: tc.id,
          content: result,
        };
        messages.push(toolMsg);
        turnMessages.push(toolMsg);
      }
    }

    // 更新工作层：追加本次的 user 消息和 AI 响应
    layer.working.push({ role: "user", content: message });
    for (const m of turnMessages) layer.working.push(m);

    // 切工作层上限
    while (layer.working.length > 40) {
      compactLayer(layer);
    }

    totalTokens = layer.working.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    const elapsed = Date.now() - startTime;
    sse(res, {
      type: "done",
      tokens: totalTokens,
      timeMs: elapsed,
      workingSize: layer.working.length,
      compacted: !!layer.compacted,
    });
  } catch (err) {
    sse(res, { type: "error", content: String(err) });
  } finally {
    res.end();
  }
});

router.post("/clear", (req: Request, res: Response) => {
  const key = (req.body?.sessionId) || "default";
  sessions.delete(key);
  sessionLastActive.delete(key);
  res.json({ ok: true });
});

export default router;
