import express from "express";
import cors from "cors";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(path.resolve(__dirname, ".."), ".env");
const logPath = path.join(path.resolve(__dirname, ".."), "server.log");

// 将所有 console 输出同时写入日志文件（设计器隐藏 cmd 窗口时也能排查）
const logStream = fs.createWriteStream(logPath, { flags: "a" });
const _origLog = console.log, _origErr = console.error, _origWarn = console.warn;
const _ts = () => new Date().toISOString();
console.log = (...a: any[]) => { _origLog(...a); logStream.write(`[${_ts()}] LOG ${a.join(" ")}\n`); };
console.error = (...a: any[]) => { _origErr(...a); logStream.write(`[${_ts()}] ERR ${a.join(" ")}\n`); };
console.warn = (...a: any[]) => { _origWarn(...a); logStream.write(`[${_ts()}] WRN ${a.join(" ")}\n`); };

// 启动时加载 .env 到 process.env
try {
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) continue;
      const key = trimmed.substring(0, eqIdx).trim();
      const value = trimmed.substring(eqIdx + 1).trim();
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
    console.log(`[Env] 已加载配置: MODEL=${process.env.MODEL}, BASE_URL=${process.env.BASE_URL}`);
  }
} catch (e) {
  console.warn("[Env] 加载 .env 失败:", e);
}

const PORT = parseInt(process.env.PORT || "9527", 10);

import uiStateRouter from "./routes/ui-state.js";
import chatRouter from "./routes/chat.js";
import applyRouter from "./routes/apply.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// 静态文件：托管前端页面
app.use(express.static(path.join(__dirname, "ui")));

// API 路由
app.use("/api/ui", uiStateRouter);
app.use("/api/chat", chatRouter);
// apply 路由直接挂载到 /api/chat，提供 /apply, /revert, /backup 端点
app.use("/api/chat", applyRouter);

import { loadConfig } from "./ai/client.js";
import OpenAI from "openai";

// 动态智能建议：AI 根据当前 .UI 文件内容实时生成操作建议
app.get("/api/suggestions", async (req, res) => {
  try {
    const uiContent = req.query.uiContent as string;
    const selectedCount = parseInt((req.query.selectedCount as string) || "0");
    const selectedEl = req.query.selectedElement as string;

    // 默认静态建议（快速返回，不调用 AI）
    if (!uiContent) {
      res.json([
        { id: "beautify", emoji: "🎨", label: "美化界面", prompt: "请美化当前界面，使用现代化的配色和间距方案" },
        { id: "layout", emoji: "📐", label: "优化布局", prompt: "请优化当前界面的布局，调整元素间的间距和对齐" },
        { id: "style", emoji: "🎯", label: "调整样式", prompt: "请优化元素样式，包括颜色、字体、边框等视觉效果" },
        { id: "responsive", emoji: "📱", label: "自适应", prompt: "请调整布局支持窗口缩放，设置合理的sizePolicy" },
      ]);
      return;
    }

    // 有文件内容时，让 AI 快速生成针对性建议
    const config = loadConfig();
    if (!config.apiKey) {
      const hasSelection = selectedCount > 0;
      const suggestions = hasSelection
        ? [
            { id: "style", emoji: "🎯", label: "美化选中", prompt: `请美化当前选中的 ${selectedCount} 个控件` },
            { id: "align", emoji: "↔️", label: "对齐控件", prompt: "请将选中的控件对齐" },
            { id: "size", emoji: "📏", label: "统一尺寸", prompt: "请将选中的控件设置为相同尺寸" },
            { id: "spacing", emoji: "🔲", label: "调整间距", prompt: "请调整选中控件之间的间距使其均匀" },
          ]
        : [
            { id: "beautify", emoji: "🎨", label: "美化界面", prompt: "请美化当前界面" },
            { id: "layout", emoji: "📐", label: "优化布局", prompt: "请优化布局" },
            { id: "responsive", emoji: "📱", label: "自适应", prompt: "请调整为响应式" },
          ];
      res.json(suggestions);
      return;
    }

    // 调用 AI 生成建议（轻量调用）
    try {
      const selInfo = selectedEl
        ? `用户选中了: ${selectedEl.substring(0, 300)}`
        : "用户未选中任何控件";
      const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
      const resp = await client.chat.completions.create({
        model: config.model,
        messages: [
          { role: "system", content: "你是UI设计助手。根据UI文件内容，生成4个简短的操作建议。每个建议包含: emoji(1个表情)、label(2-4字)、prompt(简短需求描述)。返回纯JSON数组。" },
          { role: "user", content: `${selInfo}\n文件内容:\n${uiContent.substring(0, 1500)}\n\n生成4个JSON建议按钮:` },
        ],
        max_tokens: 400,
        temperature: 0.5,
      });
      const text = resp.choices[0]?.message?.content || "";
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const suggestions = JSON.parse(jsonMatch[0]);
        res.json(suggestions.slice(0, 5));
        return;
      }
    } catch (err: any) {
      console.error(`[Suggestions] AI调用失败 (model=${config.model}): ${err.message || err}`);
    }

    // 回退
    res.json([
      { id: "beautify", emoji: "🎨", label: "美化", prompt: "请美化界面" },
      { id: "layout", emoji: "📐", label: "布局", prompt: "请优化布局" },
    ]);
  } catch {
    res.json([{ id: "beautify", emoji: "🎨", label: "美化", prompt: "请美化界面" }]);
  }
});

// ===== Export API =====
import { exportUi } from "./ai/export.js";

app.post("/api/export", (req, res) => {
  const { content, format } = req.body as { content: string; format: string };
  if (!content || !format) { res.status(400).json({ error: "Missing content or format" }); return; }
  const r = exportUi(content, format);
  if (r.ok) res.json({ ok: true, result: r.result });
  else res.status(400).json({ ok: false, error: r.error });
});

// ===== Settings API =====
app.get("/api/settings", (_req, res) => {
  try {
    const raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";
    res.json({
      apiKey: (raw.match(/API_KEY=(.+)/)||[])[1] || "",
      model: (raw.match(/MODEL=(.+)/)||[])[1] || "deepseek-v4-flash",
      baseURL: (raw.match(/BASE_URL=(.+)/)||[])[1] || "https://api.deepseek.com",
      availableModels: [
        { value: "deepseek-v4-flash", label: "DeepSeek V4 Flash (推荐)" },
        { value: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
        { value: "deepseek-chat", label: "DeepSeek Chat (旧版)" },
        { value: "deepseek-reasoner", label: "DeepSeek Reasoner" },
      ],
    });
  } catch { res.json({}); }
});

app.post("/api/settings", (req, res) => {
  try {
    const { apiKey, model, baseURL } = req.body as { apiKey?:string; model?:string; baseURL?:string };
    const lines: string[] = [];
    if (apiKey || apiKey === "") lines.push(`API_KEY=${apiKey}`);
    if (model) lines.push(`MODEL=${model}`);
    if (baseURL) lines.push(`BASE_URL=${baseURL}`);
    fs.writeFileSync(envPath, lines.join("\n") + "\n", "utf-8");
    process.env.API_KEY = apiKey || "";
    if (model) process.env.MODEL = model;
    if (baseURL) process.env.BASE_URL = baseURL;
    res.json({ ok: true });
  } catch { res.status(500).json({ ok: false }); }
});

const server = app.listen(PORT, () => {
  console.log(`🤖 Omni设计师 AI服务已启动: http://localhost:${PORT}`);
  console.log(`   API文档: http://localhost:${PORT}/api/ui/state`);
  console.log(`   前端页面: http://localhost:${PORT}`);
});

// 端口被占用时的处理
server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`端口 ${PORT} 已被占用，请先关闭占用进程`);
    process.exit(1);
  } else {
    console.error("服务启动失败:", err.message);
    process.exit(1);
  }
});

// 优雅退出：收到 SIGTERM 时关闭服务器
process.on("SIGTERM", () => {
  console.log("收到终止信号，正在关闭服务...");
  server.close(() => {
    console.log("AI服务已关闭");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("收到中断信号，正在关闭服务...");
  server.close(() => {
    console.log("AI服务已关闭");
    process.exit(0);
  });
});
