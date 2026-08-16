import { Router, Request, Response } from "express";
import { createBackup, revertToBackup, writeUiFile, revertToPreChatBackup, hasPreChatBackup, listBackups, deleteBackup } from "../ai/ui-tools.js";
import * as fs from "fs";

const router = Router();

/** POST /api/chat/apply - 直接写入 .UI 文件。已弃用：AI 现在走 ui_edit/ui_write 工具，这端点留着兼容旧调用 */
router.post("/apply", (req: Request, res: Response) => {
  const { uiFilePath, content } = req.body as {
    uiFilePath: string;
    content?: string;
  };

  if (!uiFilePath) {
    res.status(400).json({ error: "缺少 uiFilePath" });
    return;
  }

  if (!fs.existsSync(uiFilePath)) {
    res.status(404).json({ error: "UI 文件不存在，请先保存" });
    return;
  }

  if (content) {
    createBackup(uiFilePath);
    const result = writeUiFile(uiFilePath, content);
    if (result.success) {
      res.json({ ok: true, message: "修改已应用" });
    } else {
      res.status(500).json({ ok: false, error: result.error });
    }
    return;
  }

  res.json({ ok: true, message: "文件可用" });
});

/** POST /api/chat/revert - 回退到指定备份（0=最新, 1=上一版, ...） */
router.post("/revert", (req: Request, res: Response) => {
  const { uiFilePath, level } = req.body as { uiFilePath: string; level?: number };

  if (!uiFilePath) {
    res.status(400).json({ error: "缺少 uiFilePath" });
    return;
  }

  if (!fs.existsSync(uiFilePath)) {
    res.status(404).json({ error: "UI 文件不存在" });
    return;
  }

  const lv = typeof level === "number" ? level : 0;
  const success = revertToBackup(uiFilePath, lv);
  if (success) {
    res.json({ ok: true, message: lv === 0 ? "已回退到上一版本" : `已回退到第 ${lv} 个备份` });
  } else {
    res.status(404).json({ ok: false, error: `备份 ${lv} 不可用` });
  }
});

/** GET /api/chat/backups - 列出所有可用备份（含元数据） */
router.get("/backups", (req: Request, res: Response) => {
  const uiFilePath = req.query.path as string;
  if (!uiFilePath || !fs.existsSync(uiFilePath)) {
    res.json({ backups: [] });
    return;
  }
  res.json({ backups: listBackups(uiFilePath) });
});

/** POST /api/chat/backup - 手动创建备份 */
router.post("/backup", (req: Request, res: Response) => {
  const { uiFilePath, label } = req.body as { uiFilePath: string; label?: string };

  if (!uiFilePath || !fs.existsSync(uiFilePath)) {
    res.status(404).json({ error: "UI 文件不存在" });
    return;
  }

  const backupPath = createBackup(uiFilePath, label || "手动备份");
  res.json({ ok: true, backupPath });
});

/** POST /api/chat/delete-backup - 删除指定备份 */
router.post("/delete-backup", (req: Request, res: Response) => {
  const { uiFilePath, level } = req.body as { uiFilePath: string; level: number };

  if (!uiFilePath) {
    res.status(400).json({ error: "缺少 uiFilePath" });
    return;
  }

  const ok = deleteBackup(uiFilePath, level);
  if (ok) {
    res.json({ ok: true, message: `已删除备份 #${level}` });
  } else {
    res.status(404).json({ ok: false, error: `备份 #${level} 不存在` });
  }
});

/** POST /api/chat/revert-pre - 快速回退到本次对话前的状态 */
router.post("/revert-pre", (req: Request, res: Response) => {
  const { uiFilePath } = req.body as { uiFilePath: string };

  if (!uiFilePath || !fs.existsSync(uiFilePath)) {
    res.status(404).json({ error: "UI 文件不存在" });
    return;
  }

  const success = revertToPreChatBackup(uiFilePath);
  if (success) {
    res.json({ ok: true, message: "已恢复到提问前状态" });
  } else {
    res.status(404).json({ ok: false, error: "没有提问前的备份" });
  }
});

/** GET /api/chat/has-prechat - 检查是否存在提问前备份 */
router.get("/has-prechat", (req: Request, res: Response) => {
  const uiFilePath = req.query.path as string;
  res.json({ exists: hasPreChatBackup(uiFilePath || "") });
});

export default router;
