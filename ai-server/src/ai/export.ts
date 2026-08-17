import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

let jsxTransform: any;
try {
  jsxTransform = (await import("html-to-jsx-transform")).default;
} catch {
  // 没装这个包就走手写转换
}

export function exportUi(content: string, format: string): { ok: boolean; result?: string; error?: string } {
  try {
    // 先把 .ui 写到临时文件，ui2html 只认文件路径
    const tmpDir = os.tmpdir();
    const tmpUi = path.join(tmpDir, `export_${Date.now()}.ui`);
    fs.writeFileSync(tmpUi, content, "utf-8");

    // 这些格式要先过一遍 ui2html.exe 转成 HTML（没装 exe 就用手写 fallback）
    let html = "";
    if (["html", "jsx", "tsx", "vue", "xaml"].includes(format)) {
      const ui2htmlExe = path.join(process.env.OMNIDER_DIR || path.dirname(process.execPath || ""), "ui2html.exe");
      if (fs.existsSync(ui2htmlExe)) {
        html = execSync(`"${ui2htmlExe}" "${tmpUi}"`, { encoding: "utf-8", timeout: 10000 });
      } else {
        html = fallbackToHtml(content);
      }
    }

    fs.unlinkSync(tmpUi);

    switch (format) {
      case "ui": return { ok: true, result: content };
      case "xml": return { ok: true, result: `<?xml version="1.0" encoding="UTF-8"?>\n${content}` };
      case "html": return { ok: true, result: html };
      case "jsx": return { ok: true, result: htmlToJsx(html) };
      case "tsx": return { ok: true, result: htmlToTsx(html) };
      case "vue": return { ok: true, result: htmlToVue(html) };
      case "xaml": return { ok: true, result: htmlToXaml(html) };
      default: return { ok: false, error: `Unsupported: ${format}` };
    }
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function htmlToJsx(html: string): string {
  if (jsxTransform) {
    try {
      return jsxTransform(html);
    } catch {
      // fall through
    }
  }
  return fallbackJsx(html);
}

function htmlToTsx(html: string): string {
  const jsx = htmlToJsx(html);
  return `import React from 'react';\n\nconst App: React.FC = () => {\n  return (\n    ${jsx.replace(/\n/g, "\n    ")}\n  );\n};\n\nexport default App;\n`;
}

function htmlToVue(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;
  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  return `<template>\n  ${body.trim().replace(/\n/g, "\n  ")}\n</template>\n\n<script>\nexport default {\n  name: 'App',\n};\n</script>\n${styleMatch ? `<style scoped>\n${styleMatch[1]}\n</style>\n` : ""}`;
}

function htmlToXaml(_html: string): string {
  return `<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"\n        Title="Preview" Width="800" Height="600">\n  <Grid>\n  </Grid>\n</Window>\n`;
}

// ---- Fallback converters ----
function fallbackToHtml(content: string): string {
  const w = +content.match(/<width>(\d+)<\/width>/)?.[1]! || 800;
  const h = +content.match(/<height>(\d+)<\/height>/)?.[1]! || 600;
  const title = content.match(/<string>([^<]+)<\/string>/)?.[1] || "Preview";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title></head><body style="width:${w}px;height:${h}px"></body></html>`;
}

function fallbackJsx(html: string): string {
  let jsx = html
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<html[^>]*>/gi, "")
    .replace(/<\/html>/gi, "")
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<body[^>]*>/gi, "<>")
    .replace(/<\/body>/gi, "</>")
    .replace(/<meta[^>]*>/gi, "")
    .replace(/\bclass=/g, "className=")
    .replace(/<link[^>]*>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/style="([^"]*)"/g, (_: string, s: string) => {
      const camel = s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      return `style={{${camel.split(";").filter(Boolean).map(p => {
        const [k, v] = p.split(":").map(x => x.trim());
        return `${k}: "${v}"`;
      }).join(", ")}}}`;
    })
    .replace(/<input([^>]*)>/g, "<input$1 />")
    .replace(/<img([^>]*)>/g, "<img$1 />")
    .replace(/<br>/g, "<br />")
    .replace(/<hr>/g, "<hr />");

  return jsx.trim();
}
