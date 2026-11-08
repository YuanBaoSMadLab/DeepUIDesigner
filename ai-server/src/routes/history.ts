import { Router, Request, Response } from "express";
import * as fs from "fs";
import {
  getRevision, listRevisions, makeDiff, readRevisionFile, recordRevision,
  revertLast, revertSession, revertToRevision, snapshotManual,
} from "../ai/history.js";
import { readUiFile, validateUi } from "../ai/ui-tools.js";

const router = Router();

function badPath(p: unknown): p is string {
  return typeof p === "string" && p.length > 0 && fs.existsSync(p);
}

router.get("/", (req: Request, res: Response) => {
  const filePath = req.query.path as string;
  if (!badPath(filePath)) { res.json({ revisions: [], file: null }); return; }
  const revisions = listRevisions(filePath).map(r => {
    const after = readRevisionFile(filePath, r.id, "after") || "";
    const before = readRevisionFile(filePath, r.id, "before") || "";
    return {
      ...r,
      added: Math.max(0, after.split("\n").length - before.split("\n").length),
      removed: Math.max(0, before.split("\n").length - after.split("\n").length),
    };
  });
  res.json({
    revisions,
    file: {
      path: filePath,
      lines: readUiFile(filePath).split("\n").length,
      bytes: fs.statSync(filePath).size,
      modified: fs.statSync(filePath).mtime.toISOString(),
    },
  });
});

router.get("/diff", (req: Request, res: Response) => {
  const filePath = req.query.path as string;
  const id = req.query.id as string;
  if (!badPath(filePath) || !id) { res.status(400).json({ error: "缺少 path 或 id" }); return; }
  const before = readRevisionFile(filePath, id, "before");
  const after = readRevisionFile(filePath, id, "after");
  if (before === null || after === null) { res.status(404).json({ error: "版本不存在" }); return; }
  res.json({ id, before, after, diff: makeDiff(before, after) });
});

router.post("/revert", (req: Request, res: Response) => {
  const { path: filePath, id } = req.body as { path: string; id: string };
  if (!badPath(filePath) || !id) { res.status(400).json({ ok: false, error: "缺少 path 或 id" }); return; }
  const r = revertToRevision(filePath, id);
  res.json(r.ok ? { ok: true, message: `已回退到版本 ${id}`, revision: r.revision } : { ok: false, error: r.error });
});

router.post("/revert-last", (req: Request, res: Response) => {
  const { path: filePath } = req.body as { path: string };
  if (!badPath(filePath)) { res.status(400).json({ ok: false, error: "文件不存在" }); return; }
  const r = revertLast(filePath);
  res.json(r.ok ? { ok: true, message: "已回退上一版", revision: r.revision } : { ok: false, error: r.error });
});

router.post("/snapshot", (req: Request, res: Response) => {
  const { path: filePath, label } = req.body as { path: string; label?: string };
  if (!badPath(filePath)) { res.status(400).json({ ok: false, error: "文件不存在" }); return; }
  const rev = snapshotManual(filePath, label || "手动快照");
  res.json({ ok: true, revision: rev });
});

router.post("/revert-session", (req: Request, res: Response) => {
  const { path: filePath, sessionId } = req.body as { path: string; sessionId: string };
  if (!badPath(filePath) || !sessionId) { res.status(400).json({ ok: false, error: "缺少参数" }); return; }
  const ok = revertSession(filePath, sessionId);
  res.json(ok ? { ok: true, message: "已恢复到本次运行前" } : { ok: false, error: "找不到本次运行的快照" });
});

router.get("/revision", (req: Request, res: Response) => {
  const filePath = req.query.path as string;
  const id = req.query.id as string;
  const side = req.query.side === "after" ? "after" : "before";
  if (!badPath(filePath) || !id) { res.status(400).json({ error: "缺少参数" }); return; }
  const rev = getRevision(filePath, id);
  res.json({ revision: rev || null, content: readRevisionFile(filePath, id, side) });
});

// ---- 当前文件内容 / 手动编辑保存 ----
router.get("/file", (req: Request, res: Response) => {
  const filePath = req.query.path as string;
  if (!badPath(filePath)) { res.status(404).json({ error: "文件不存在" }); return; }
  res.json({ path: filePath, content: readUiFile(filePath), modified: fs.statSync(filePath).mtime.toISOString() });
});

router.post("/file", (req: Request, res: Response) => {
  const { path: filePath, content } = req.body as { path: string; content: string };
  if (!badPath(filePath) || typeof content !== "string") {
    res.status(400).json({ ok: false, error: "缺少 path 或 content" });
    return;
  }
  const err = validateUi(content);
  if (err) { res.status(400).json({ ok: false, error: err }); return; }
  const before = readUiFile(filePath);
  if (before === content) { res.json({ ok: true, message: "内容没有变化" }); return; }
  const rev = recordRevision(filePath, before, content, { tool: "manual-edit", summary: "手动编辑文件" });
  fs.writeFileSync(filePath, content, "utf-8");
  res.json({ ok: true, message: "已保存", revision: rev });
});

export default router;
