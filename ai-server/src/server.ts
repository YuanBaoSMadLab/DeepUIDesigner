import express from "express";
import cors from "cors";
import * as path from "path";
import { fileURLToPath } from "url";

import uiStateRouter from "./routes/ui-state.js";
import chatRouter from "./routes/chat.js";
import settingsRouter from "./routes/settings.js";
import historyRouter from "./routes/history.js";
import toolsRouter from "./routes/tools.js";
import { exportUi } from "./ai/export.js";
import { loadConfig, activeProvider } from "./ai/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "9527", 10);

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

app.use(express.static(path.join(__dirname, "ui")));
app.use("/api/ui", uiStateRouter);
app.use("/api/chat", chatRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/history", historyRouter);
app.use("/api/tools", toolsRouter);

app.post("/api/export", (req, res) => {
  const { content, format } = req.body as { content: string; format: string };
  if (!content || !format) { res.status(400).json({ error: "Missing content or format" }); return; }
  const r = exportUi(content, format);
  if (r.ok) res.json({ ok: true, result: r.result });
  else res.status(400).json({ ok: false, error: r.error });
});

app.get("/api/suggestions", (_req, res) => {
  res.json([
    { id: "beautify", label: "美化界面", prompt: "请美化当前界面，使用现代、克制的配色和间距" },
    { id: "layout", label: "优化布局", prompt: "请检查并优化当前界面的布局，修复重叠和越界" },
    { id: "responsive", label: "自适应", prompt: "请调整布局使其支持窗口缩放，设置合理的 sizePolicy" },
    { id: "polish", label: "细节打磨", prompt: "请检查对齐、间距、字体和控件尺寸，做细节优化" },
  ]);
});

app.get("/api/health", (_req, res) => {
  const cfg = loadConfig();
  const p = activeProvider(cfg);
  res.json({
    ok: true,
    provider: p?.name || null,
    model: cfg.activeModel,
    hasKey: !!p?.apiKey,
    vision: { supportsVision: !!p?.supportsVision, visionModel: p?.visionModel || "" },
  });
});

const server = app.listen(PORT, () => {
  console.log(`OmniDesigner AI service: http://localhost:${PORT}`);
  console.log(`Panel: http://localhost:${PORT}/`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") console.error(`端口 ${PORT} 已被占用`);
  else console.error("服务启动失败:", err.message);
  process.exit(1);
});

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    console.log("正在关闭 AI 服务...");
    server.close(() => process.exit(0));
  });
}
