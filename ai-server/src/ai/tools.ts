import * as fs from "fs";
import { checkLayout, summarizeTree } from "./layout.js";
import { captureDesigner } from "./screenshot.js";
import {
  addWidget, applyEdit, readUiFile, removeWidget, setProperty, validateUi, widgetBlock, allWidgetNames,
} from "./ui-tools.js";
import { listRevisions, recordRevision, revertLast, revertToRevision } from "./history.js";

export interface ToolImage {
  path: string;
  url: string;
  width?: number;
  height?: number;
}

export interface ToolContext {
  filePath: string;
  selectedElement: string | null;
  sessionId: string;
}

export interface ToolResult {
  text: string;
  ok: boolean;
  image?: ToolImage;
  changed?: boolean;
  phase?: string;
}

function needFile(ctx: ToolContext): string | null {
  if (!ctx.filePath) return "当前没有绑定 .ui 文件。请先在设计器里保存并打开一个 .ui 文件。";
  if (!fs.existsSync(ctx.filePath)) return `文件不存在: ${ctx.filePath}`;
  return null;
}

function mutate(
  ctx: ToolContext,
  tool: string,
  widget: string | undefined,
  summary: string,
  fn: (content: string) => { ok: boolean; content?: string; error?: string }
): ToolResult {
  const missing = needFile(ctx);
  if (missing) return { ok: false, text: missing };
  const before = readUiFile(ctx.filePath);
  let r: { ok: boolean; content?: string; error?: string };
  try {
    r = fn(before);
  } catch (err) {
    return { ok: false, text: `${tool} 执行失败: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!r.ok || r.content === undefined) return { ok: false, text: `${tool} 失败: ${r.error || "未知错误"}` };
  if (r.content === before) return { ok: false, text: `${tool} 没有产生实际变化，请检查参数` };
  const err = validateUi(r.content);
  if (err) return { ok: false, text: `修改后 XML 校验失败，已放弃本次修改：${err}` };

  const rev = recordRevision(ctx.filePath, before, r.content, {
    tool, widget, summary, sessionId: ctx.sessionId,
  });
  fs.writeFileSync(ctx.filePath, r.content, "utf-8");
  return {
    ok: true,
    changed: true,
    phase: "edit",
    text: `OK: ${summary}（版本 ${rev.id}，可回退）`,
  };
}

export async function executeTool(name: string, rawArgs: string, ctx: ToolContext): Promise<ToolResult> {
  let args: any = {};
  try { args = rawArgs ? JSON.parse(rawArgs) : {}; } catch { return { ok: false, text: `工具参数不是合法 JSON: ${rawArgs.slice(0, 200)}` }; }

  const missing = needFile(ctx);
  if (missing && name !== "ui_selection" && name !== "ui_screenshot") return { ok: false, text: missing };

  switch (name) {
    case "ui_read": {
      const content = readUiFile(ctx.filePath);
      const tree = summarizeTree(content);
      const widget = typeof args.widget === "string" ? args.widget.trim() : "";
      let body = content;
      if (widget) {
        const block = widgetBlock(content, widget);
        if (!block) return { ok: false, text: `找不到控件 "${widget}"。现有控件：${allWidgetNames(content).slice(0, 40).join(", ")}` };
        body = block;
      }
      const capped = body.length > 14000 ? body.slice(0, 14000) + "\n...(已截断，可用 ui_read + widget 参数读取局部)" : body;
      return {
        ok: true,
        phase: "inspect",
        text: `控件树：\n${tree}\n\n文件内容：\n${capped}`,
      };
    }

    case "ui_selection": {
      if (!ctx.selectedElement) return { ok: true, phase: "inspect", text: "用户当前没有选中任何控件。" };
      return {
        ok: true,
        phase: "inspect",
        text: `用户选中的控件：\n${ctx.selectedElement.slice(0, 8000)}`,
      };
    }

    case "ui_set_property": {
      const widget = String(args.widget || "");
      const property = String(args.property || "");
      const value = String(args.value ?? "");
      const kind = String(args.kind || (property === "geometry" ? "rect" : "string"));
      if (!widget || !property) return { ok: false, text: "widget 和 property 必填" };
      return mutate(ctx, "ui_set_property", widget, `设置 ${widget}.${property}`, c =>
        setProperty(c, widget, property, value, kind));
    }

    case "ui_edit": {
      const widget = String(args.widget || "");
      const oldString = String(args.old_string || "");
      const newString = String(args.new_string || "");
      if (!widget || !oldString) return { ok: false, text: "widget 和 old_string 必填" };
      return mutate(ctx, "ui_edit", widget, `编辑 ${widget}`, c =>
        applyEdit(c, widget, oldString, newString));
    }

    case "ui_add_widget": {
      const parent = String(args.parent || "");
      const xml = String(args.xml || "");
      if (!parent || !xml) return { ok: false, text: "parent 和 xml 必填" };
      const m = xml.match(/<widget[^>]*name="([^"]+)"/);
      return mutate(ctx, "ui_add_widget", m?.[1], `在 ${parent} 中添加控件`, c =>
        addWidget(c, parent, xml));
    }

    case "ui_remove_widget": {
      const widget = String(args.widget || "");
      if (!widget) return { ok: false, text: "widget 必填" };
      return mutate(ctx, "ui_remove_widget", widget, `删除控件 ${widget}`, c =>
        removeWidget(c, widget));
    }

    case "ui_check_layout": {
      const content = readUiFile(ctx.filePath);
      const issues = checkLayout(content);
      if (issues.length === 0) {
        return { ok: true, phase: "verify", text: "布局检查通过：没有发现重叠、遮挡、越界或零尺寸问题。" };
      }
      const lines = issues.map(i =>
        `[${i.severity}] ${i.code} ${i.widget}${i.other ? ` ↔ ${i.other}` : ""}: ${i.message}` +
        (i.rect ? ` @ ${i.rect.x},${i.rect.y} ${i.rect.w}x${i.rect.h}` : ""));
      return {
        ok: true,
        phase: "verify",
        text: `布局检查发现 ${issues.length} 个问题：\n${lines.join("\n")}`,
      };
    }

    case "ui_screenshot": {
      const shot = await captureDesigner();
      if (!shot.ok || !shot.url || !shot.path) {
        return {
          ok: false,
          phase: "verify",
          text: `截图失败：${shot.error || "未知错误"}。请确认 designer.exe 正在运行且窗口未最小化。仍可依赖 ui_check_layout 的静态检查。`,
        };
      }
      return {
        ok: true,
        phase: "verify",
        text: `已截取当前设计器画面（${shot.width}x${shot.height}，${shot.method}）。请查看画面确认布局和遮挡。`,
        image: { path: shot.path, url: shot.url, width: shot.width, height: shot.height },
      };
    }

    case "ui_history": {
      const list = listRevisions(ctx.filePath).slice(0, 12);
      if (!list.length) return { ok: true, phase: "inspect", text: "还没有修改历史。" };
      const lines = list.map(r =>
        `- ${r.id} ${r.time.replace("T", " ").slice(0, 19)} [${r.tool}] ${r.summary}`);
      return { ok: true, phase: "inspect", text: `最近修改历史：\n${lines.join("\n")}` };
    }

    case "ui_revert": {
      const rev = String(args.revision || "").trim();
      const r = rev ? revertToRevision(ctx.filePath, rev) : revertLast(ctx.filePath);
      if (!r.ok) return { ok: false, text: `回退失败：${r.error}` };
      return {
        ok: true,
        changed: true,
        phase: "edit",
        text: `已回退到版本 ${rev || "上一版"}，并记录为 ${r.revision?.id || "新版本"}。`,
      };
    }

    default:
      return { ok: false, text: `未知工具: ${name}` };
  }
}
