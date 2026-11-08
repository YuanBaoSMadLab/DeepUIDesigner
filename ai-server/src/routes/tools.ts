import { Router, Request, Response } from "express";
import * as fs from "fs";
import { captureDesigner } from "../ai/screenshot.js";
import { checkLayout, summarizeTree } from "../ai/layout.js";
import { readUiFile } from "../ai/ui-tools.js";

const router = Router();

router.post("/screenshot", async (req: Request, res: Response) => {
  const shot = await captureDesigner((req.body?.process as string) || undefined);
  if (!shot.ok) { res.status(500).json({ ok: false, error: shot.error }); return; }
  res.json(shot);
});

router.post("/layout", (req: Request, res: Response) => {
  const filePath = (req.body?.path as string) || "";
  if (!filePath || !fs.existsSync(filePath)) {
    res.status(400).json({ ok: false, error: "文件不存在" });
    return;
  }
  const content = readUiFile(filePath);
  const issues = checkLayout(content);
  res.json({ ok: true, issues, tree: summarizeTree(content) });
});

export default router;
