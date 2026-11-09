import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(SERVER_ROOT, "tools", "capture-window.ps1");
const SHOT_DIR = path.join(SERVER_ROOT, ".omnidesigner", "shots");

export interface ShotResult {
  ok: boolean;
  path?: string;
  url?: string;
  width?: number;
  height?: number;
  method?: string;
  process?: string;
  title?: string;
  error?: string;
}

export interface WindowInfo {
  process: string;
  title: string;
}

export interface CaptureOptions {
  processName?: string;
  title?: string;
}

function runScript(args: string[], timeoutMs = 20000): Promise<{ ok: boolean; stdout: string; stderr: string; error?: string }> {
  return new Promise(resolve => {
    const child = spawn("powershell.exe", args, { windowsHide: true });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, stdout, stderr, error: "执行超时（20 秒）" });
    }, timeoutMs);
    child.stdout.on("data", d => { stdout += d.toString(); });
    child.stderr.on("data", d => { stderr += d.toString(); });
    child.on("error", err => { clearTimeout(timer); resolve({ ok: false, stdout, stderr, error: err.message }); });
    child.on("close", () => { clearTimeout(timer); resolve({ ok: true, stdout, stderr }); });
  });
}

function lastJsonLine(stdout: string): any {
  const line = stdout.trim().split(/\r?\n/).filter(Boolean).pop() || "";
  return JSON.parse(line);
}

/** 列出当前有可见窗口的进程，供 Agent 选择截图目标 */
export async function listWindows(): Promise<{ ok: boolean; windows?: WindowInfo[]; error?: string }> {
  if (!fs.existsSync(SCRIPT)) return { ok: false, error: `截屏脚本缺失: ${SCRIPT}` };
  const run = await runScript([
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", SCRIPT, "-List",
  ]);
  if (!run.ok) return { ok: false, error: run.error };
  try {
    const data = lastJsonLine(run.stdout);
    if (!data.ok) return { ok: false, error: data.error || run.stderr };
    return { ok: true, windows: data.windows || [] };
  } catch {
    return { ok: false, error: run.stderr || run.stdout || "窗口列表解析失败" };
  }
}

/** 截取指定进程或标题匹配的窗口；默认截设计器 */
export async function captureWindow(opts: CaptureOptions = {}): Promise<ShotResult> {
  if (!fs.existsSync(SCRIPT)) return { ok: false, error: `截屏脚本缺失: ${SCRIPT}` };
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const out = path.join(SHOT_DIR, `shot-${Date.now()}.png`);
  const processName = opts.processName || process.env.OMNI_CAPTURE_PROCESS || "designer";
  const args = [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", SCRIPT,
    "-ProcessName", processName,
    "-OutFile", out,
  ];
  if (opts.title) args.push("-TitleMatch", opts.title);

  const run = await runScript(args);
  if (!run.ok) return { ok: false, error: run.error };

  try {
    const data = lastJsonLine(run.stdout);
    if (!data.ok) return { ok: false, error: data.error || run.stderr };
    if (!fs.existsSync(out)) return { ok: false, error: "截图文件没有生成" };
    const b64 = fs.readFileSync(out).toString("base64");
    return {
      ok: true,
      path: out,
      url: `data:image/png;base64,${b64}`,
      width: data.width,
      height: data.height,
      method: data.method,
      process: data.process,
      title: data.title,
    };
  } catch {
    return { ok: false, error: run.stderr || run.stdout || "截屏脚本无输出" };
  }
}

export async function captureDesigner(processName = process.env.OMNI_CAPTURE_PROCESS || "designer"): Promise<ShotResult> {
  return captureWindow({ processName });
}

export function shotDir(): string {
  return SHOT_DIR;
}
