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
  /** 固定 system prompt，永远不丢 */
  system: string;
  /** 文件路径/选中元素摘要，定期刷新 */
  projectSummary: string;
  /** 工作层：最近的对话消息 + 工具调用，超长会被压缩 */
  working: ChatMessage[];
  /** 最近一次压缩出的摘要，下轮直接注入 */
  compacted: string | null;
  /** 跨多次压缩累积的关键历史，只增不减 */
  persistentSummary: string;
  /** 距上次注入项目摘要的轮数 */
  lastSummaryTurn: number;
  /** 用户首条消息（任务目标），压缩也不淘汰 */
  initialGoal: string;
}

const sessions = new Map<string, ContextLayer>();
// 记录每个 session 的最后活跃时间戳，用于自动清理
const sessionLastActive = new Map<string, number>();
// 30 分钟没动静就清掉，省内存
const SESSION_TTL_MS = 30 * 60 * 1000;
// 清理定时器每 5 分钟跑一次
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [key, lastActive] of sessionLastActive) {
    if (now - lastActive > SESSION_TTL_MS) {
      sessions.delete(key);
      sessionLastActive.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS).unref(); // unref 让定时器不阻塞进程退出

// 每 N 轮对话重注一次项目摘要，防止上下文里项目信息过时
const REINJECT_INTERVAL = 5;
// 上下文软上限（DeepSeek 1M 窗口，留点余量）
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

/** 压缩工作层：旧消息压成摘要并累积进 persistentSummary（历史不丢），工作层只留最近 3 轮对话 */
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

  // 摘要里带上工具调用结果，光记工具名后面看不懂上下文
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
      const short = m.content.substring(0, 120);
      actions.push(`结果: ${short}`);
    }
  }

  const newCompact = `[历史摘要: ${actions.join(" → ")}]`;

  // 并进持久层（旧的 + 新的）
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
  // 对话前自动备份一份，AI 改砸了用户也能一键回到现在这个状态
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

    layer.system = systemPrompt;
    const selSummary = context.selectedElement
      ? extractElementName(context.selectedElement)
      : "none";
    const summary = filePath
      ? `Current file: ${filePath}. Selected: ${selSummary}.`
      : "No file bound.";
    layer.projectSummary = summary;

    // 记住用户第一条消息当任务锚点，压缩淘汰不掉它
    if (!layer.initialGoal && message.trim()) {
      layer.initialGoal = message.substring(0, 300);
    }

    // 消息组装顺序：system → 任务目标 → 操作历史 → 最近操作 → 项目状态 → 工作层 → 本次提问
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

    // 项目摘要按轮数重注
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

    let totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    if (totalTokens > TOKEN_SOFT_LIMIT) {
      compactLayer(layer);
      // 超限后按压缩后的层重建，持久层和目标照样注入
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

    // 工作层超长就压缩
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
