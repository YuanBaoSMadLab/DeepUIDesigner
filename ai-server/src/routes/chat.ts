import { Router, Request, Response } from "express";
import { activeCredentials, activeProvider, loadConfig } from "../ai/config.js";
import { clearSession, runAgent } from "../ai/agent.js";
import type { PromptContext } from "../ai/prompts.js";

const router = Router();

function sse(res: Response, data: unknown): void {
  if (res.writableEnded) return;
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

router.post("/", async (req: Request, res: Response) => {
  const { message, context, sessionId, attachSelection } = req.body as {
    message: string;
    context?: PromptContext;
    sessionId?: string;
    attachSelection?: boolean;
  };

  if (!message || !message.trim()) {
    res.status(400).json({ error: "消息不能为空" });
    return;
  }

  const cfg = loadConfig();
  let provider;
  try {
    provider = activeCredentials(cfg);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    return;
  }
  const active = activeProvider(cfg);
  if (!active) {
    res.status(400).json({ error: "没有活动模型服务商" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const controller = new AbortController();
  let finished = false;
  res.on("close", () => {
    if (!finished) controller.abort();
  });

  const ctx: PromptContext = {
    uiFilePath: context?.uiFilePath || "",
    selectedElement: context?.selectedElement || null,
    attachSelection: attachSelection !== false,
  };

  await runAgent({
    cfg,
    provider,
    model: cfg.activeModel || active.models[0],
    sessionId: sessionId || "default",
    message: message.trim(),
    context: ctx,
    signal: controller.signal,
    send: (event) => {
      if (event.type === "done" || event.type === "error") finished = true;
      sse(res, event);
    },
  });

  finished = true;
  if (!res.writableEnded) res.end();
});

router.post("/clear", (req: Request, res: Response) => {
  clearSession((req.body?.sessionId as string) || "default");
  res.json({ ok: true });
});

export default router;
