import { Router, Request, Response } from "express";
import * as fs from "fs";

const router = Router();

/** 内存里的当前 UI 状态。前端经 QWebChannel 上报，字段都是 camelCase（uiFilePath/selectedElement/objectTree），别改成别的命名 */
let currentState = {
  uiFilePath: "",
  uiContent: "",
  selectedElement: null as string | null,
  objectTree: null as object | null,
};

export function getCurrentState() {
  return { ...currentState };
}

export function setUiFilePath(path: string) {
  currentState.uiFilePath = path;
  if (path && fs.existsSync(path)) {
    currentState.uiContent = fs.readFileSync(path, "utf-8");
  }
}

/** GET /api/ui/state - 前端获取当前UI状态 */
router.get("/state", (_req: Request, res: Response) => {
  // 磁盘上的文件可能被 Qt 那边改过，先重读一遍再返回
  if (currentState.uiFilePath && fs.existsSync(currentState.uiFilePath)) {
    currentState.uiContent = fs.readFileSync(currentState.uiFilePath, "utf-8");
  }
  res.json(currentState);
});

/** POST /api/ui/update - C++ bridge 或前端更新状态 */
router.post("/update", (req: Request, res: Response) => {
  const { uiFilePath, selectedElement, objectTree } = req.body;
  if (uiFilePath !== undefined) {
    currentState.uiFilePath = uiFilePath;
    if (uiFilePath && fs.existsSync(uiFilePath)) {
      currentState.uiContent = fs.readFileSync(uiFilePath, "utf-8");
    }
  }
  if (selectedElement !== undefined) {
    currentState.selectedElement = selectedElement;
  }
  if (objectTree !== undefined) {
    currentState.objectTree = objectTree;
  }
  res.json({ ok: true });
});

/** POST /api/ui/file-content - 获取指定文件内容 */
router.post("/file-content", (req: Request, res: Response) => {
  const { filePath } = req.body;
  if (!filePath || !fs.existsSync(filePath)) {
    res.status(404).json({ error: "文件不存在" });
    return;
  }
  const content = fs.readFileSync(filePath, "utf-8");
  res.json({ content });
});

export default router;
