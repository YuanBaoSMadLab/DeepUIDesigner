import { Router, Request, Response } from "express";

const router = Router();

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_TEXT_CHARS = 60000;

const TEXT_EXT = new Set([
  ".txt", ".md", ".markdown", ".json", ".xml", ".ui", ".csv", ".log", ".yaml", ".yml",
  ".ini", ".cfg", ".conf", ".py", ".js", ".mjs", ".ts", ".tsx", ".jsx", ".css", ".html",
  ".htm", ".sql", ".sh", ".bat", ".ps1", ".cpp", ".cc", ".c", ".h", ".hpp", ".java",
  ".go", ".rs", ".qss", ".pro", ".cmake",
]);

function extOf(name: string): string {
  const i = name.toLowerCase().lastIndexOf(".");
  return i >= 0 ? name.slice(i) : "";
}

/** POST /api/upload  接收 { name, type, dataUrl }，返回文本内容或图片数据 */
router.post("/", (req: Request, res: Response) => {
  const { name, type, dataUrl } = req.body as { name?: string; type?: string; dataUrl?: string };
  if (!dataUrl || !/^data:[^;]+;base64,/.test(dataUrl)) {
    res.status(400).json({ error: "缺少文件内容" });
    return;
  }
  const safeName = (name || "未命名文件").replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) { res.status(400).json({ error: "文件格式不正确" }); return; }

  const mime = type || m[1] || "";
  let buf: Buffer;
  try { buf = Buffer.from(m[2], "base64"); } catch { res.status(400).json({ error: "文件解码失败" }); return; }

  if (mime.startsWith("image/")) {
    if (buf.length > MAX_IMAGE_BYTES) {
      res.status(413).json({ error: `图片不能超过 ${MAX_IMAGE_BYTES / 1024 / 1024}MB` });
      return;
    }
    res.json({
      ok: true,
      attachment: { name: safeName, type: mime, kind: "image", size: buf.length, dataUrl },
    });
    return;
  }

  if (TEXT_EXT.has(extOf(safeName)) || mime.startsWith("text/")) {
    if (buf.length > MAX_TEXT_BYTES) {
      res.status(413).json({ error: "文档不能超过 1MB" });
      return;
    }
    const text = buf.toString("utf-8").replace(/\u0000/g, "");
    res.json({
      ok: true,
      attachment: {
        name: safeName,
        type: mime || "text/plain",
        kind: "text",
        size: buf.length,
        text: text.slice(0, MAX_TEXT_CHARS),
        truncated: text.length > MAX_TEXT_CHARS,
      },
    });
    return;
  }

  res.status(415).json({ error: "暂不支持该文件类型，请上传图片或文本类文档（.ui/.txt/.md/.json 等）" });
});

export default router;
