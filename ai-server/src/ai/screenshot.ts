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
  error?: string;
}

export async function captureDesigner(processName = process.env.OMNI_CAPTURE_PROCESS || "designer"): Promise<ShotResult> {
  if (!fs.existsSync(SCRIPT)) return { ok: false, error: `截屏脚本缺失: ${SCRIPT}` };
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const out = path.join(SHOT_DIR, `shot-${Date.now()}.png`);
  const args = [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", SCRIPT,
    "-ProcessName", processName,
    "-OutFile", out,
  ];

  return new Promise(resolve => {
    const child = spawn("powershell.exe", args, { windowsHide: true });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, error: "截屏超时（20 秒）" });
    }, 20000);

    child.stdout.on("data", d => { stdout += d.toString(); });
    child.stderr.on("data", d => { stderr += d.toString(); });
    child.on("error", err => { clearTimeout(timer); resolve({ ok: false, error: err.message }); });
    child.on("close", () => {
      clearTimeout(timer);
      const line = stdout.trim().split(/\r?\n/).filter(Boolean).pop() || "";
      try {
        const data = JSON.parse(line);
        if (!data.ok) { resolve({ ok: false, error: data.error || stderr }); return; }
        if (!fs.existsSync(out)) { resolve({ ok: false, error: "截图文件没有生成" }); return; }
        const b64 = fs.readFileSync(out).toString("base64");
        resolve({
          ok: true,
          path: out,
          url: `data:image/png;base64,${b64}`,
          width: data.width,
          height: data.height,
          method: data.method,
        });
      } catch {
        resolve({ ok: false, error: stderr || stdout || "截屏脚本无输出" });
      }
    });
  });
}

export function shotDir(): string {
  return SHOT_DIR;
}
