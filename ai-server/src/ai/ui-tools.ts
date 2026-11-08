import * as fs from "fs";
import { parseWidgets, WidgetNode } from "./layout.js";

export function readUiFile(filePath: string): string {
  if (!filePath || !fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf-8");
}

export function allWidgetNames(content: string): string[] {
  return parseWidgets(content).map(n => n.name).filter(Boolean);
}

export function findWidget(content: string, name: string): WidgetNode | null {
  const hits = parseWidgets(content).filter(n => n.name === name);
  if (hits.length > 1) return null;
  return hits[0] || null;
}

export function validateUi(content: string): string | null {
  if (!/<ui\b/.test(content) || !/<\/ui>/.test(content)) return "不是完整的 Qt .ui 文件（缺少 <ui> 根节点）";
  for (const tag of ["widget", "layout", "item", "property", "ui"]) {
    const re = new RegExp(`<${tag}\\b[^>]*?(/?)>`, "g");
    let open = 0, close = 0, m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (/^<\//.test(m[0])) continue;
      if (!m[1]) open++;
    }
    close = (content.match(new RegExp(`</${tag}>`, "g")) || []).length;
    if (open !== close) return `XML 结构错误：<${tag}> 开标签 ${open} 个，闭标签 ${close} 个`;
  }
  if (/<widget[^>]*\salign\s*=/.test(content)) {
    return "格式错误：不要在 <widget> 上写 align，请用 <property name=\"alignment\"><set>Qt::AlignCenter</set></property>";
  }
  if (/<enum>/.test(content)) return "格式错误：不要使用 <enum>，枚举请用 <set>Qt::EnumName</set>";
  const sets = content.match(/<set>([^<]+)<\/set>/g) || [];
  for (const s of sets) {
    const v = s.replace(/<\/?set>/g, "");
    if (/^[A-Z]/.test(v) && !v.startsWith("Qt::") && v !== "true" && v !== "false") {
      return `格式错误：<set> 中的枚举值 "${v}" 缺少 Qt:: 前缀`;
    }
  }
  if (/<rect>\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+\s*<\/rect>/.test(content)) {
    return "格式错误：rect 不能使用逗号分隔，请用 <rect><x>..</x><y>..</y><width>..</width><height>..</height></rect>";
  }
  return null;
}

function indentOf(content: string, pos: number): string {
  const lineStart = content.lastIndexOf("\n", pos - 1) + 1;
  const line = content.slice(lineStart, pos);
  const m = line.match(/^[ \t]*/);
  return m ? m[0] : "";
}

function reindent(xml: string, indent: string): string {
  const lines = xml.replace(/\r\n/g, "\n").split("\n");
  const nonEmpty = lines.filter(l => l.trim());
  if (!nonEmpty.length) return xml;
  const min = Math.min(...nonEmpty.map(l => (l.match(/^[ \t]*/) || [""])[0].length));
  return lines.map(l => l.trim() ? indent + l.slice(min) : "").join("\n");
}

export function widgetBlock(content: string, name: string): string | null {
  const node = findWidget(content, name);
  if (!node) return null;
  return content.substring(node.start, node.end);
}

export function setProperty(
  content: string,
  widget: string,
  property: string,
  value: string,
  kind = "string"
): { ok: boolean; content?: string; error?: string } {
  const nodes = parseWidgets(content).filter(n => n.name === widget);
  if (nodes.length === 0) return { ok: false, error: `找不到控件 "${widget}"。现有控件：${allWidgetNames(content).slice(0, 30).join(", ")}` };
  if (nodes.length > 1) return { ok: false, error: `控件名 "${widget}" 重复，无法确定目标` };
  const node = nodes[0];
  const block = content.substring(node.openStart, node.end);
  const openTag = content.substring(node.openStart, node.openEnd);

  // 只在自己的直接属性区操作，避免误改子控件同名属性
  const childStartRel = block.indexOf("<widget", node.openEnd - node.openStart);
  const directEndRel = childStartRel >= 0 ? childStartRel : block.length;
  const direct = block.slice(0, directEndRel);

  const propXml = buildProperty(property, value, kind);
  const existing = new RegExp(`<property\\s+name="${escapeRegex(property)}"\\s*>[\\s\\S]*?</property>`);
  const match = direct.match(existing);

  let newBlock: string;
  if (match && match.index !== undefined) {
    const indent = indentOf(content, node.openStart + match.index);
    const lineStart = block.lastIndexOf("\n", match.index - 1) + 1;
    newBlock = block.slice(0, lineStart) + reindent(propXml, indent) + block.slice(match.index + match[0].length);
  } else {
    const selfClosing = /\/>\s*$/.test(openTag);
    if (selfClosing) {
      const open = openTag.replace(/\/>\s*$/, ">");
      const indent = indentOf(content, node.openStart);
      newBlock = open + "\n" + reindent(propXml, indent + " ") + "\n" + indent + "</widget>";
    } else {
      const childStartRel = block.indexOf("<widget", node.openEnd - node.openStart);
      const closeStartRel = block.lastIndexOf("</widget>");
      const insertAt = childStartRel >= 0 ? childStartRel : closeStartRel;
      const lineStart = block.lastIndexOf("\n", insertAt - 1) + 1;
      const indent = indentOf(content, node.openStart);
      newBlock = block.slice(0, lineStart) + reindent(propXml, indent + " ") + "\n" + block.slice(lineStart);
    }
  }

  const next = content.slice(0, node.openStart) + newBlock + content.slice(node.end);
  const err = validateUi(next);
  if (err) return { ok: false, error: err };
  return { ok: true, content: next };
}

function buildProperty(name: string, value: string, kind: string): string {
  let inner: string;
  if (kind === "raw") inner = value;
  else if (kind === "bool") inner = `<bool>${value === "true" ? "true" : "false"}</bool>`;
  else if (kind === "number") inner = `<number>${Number(value)}</number>`;
  else if (kind === "rect") {
    const nums = parseRectValue(value);
    if (!nums) throw new Error("geometry 值格式应为 x,y,w,h");
    inner = `<rect>\n  <x>${nums[0]}</x>\n  <y>${nums[1]}</y>\n  <width>${nums[2]}</width>\n  <height>${nums[3]}</height>\n </rect>`;
  } else if (name === "geometry") {
    const nums = parseRectValue(value);
    if (!nums) throw new Error("geometry 值格式应为 x,y,w,h");
    inner = `<rect>\n  <x>${nums[0]}</x>\n  <y>${nums[1]}</y>\n  <width>${nums[2]}</width>\n  <height>${nums[3]}</height>\n </rect>`;
  } else {
    inner = `<string>${escapeXml(value)}</string>`;
  }
  return `<property name="${name}">\n ${inner}\n</property>`;
}

function parseRectValue(value: string): number[] | null {
  const clean = value.trim();
  if (clean.startsWith("{")) {
    try {
      const o = JSON.parse(clean);
      const nums = [o.x, o.y, o.width ?? o.w, o.height ?? o.h];
      return nums.every(n => Number.isFinite(Number(n))) ? nums.map(Number) : null;
    } catch { return null; }
  }
  const parts = clean.split(/[,\s]+/).map(Number);
  return parts.length === 4 && parts.every(Number.isFinite) ? parts : null;
}

export function applyEdit(
  content: string,
  widget: string,
  oldString: string,
  newString: string
): { ok: boolean; content?: string; error?: string } {
  if (!oldString) return { ok: false, error: "old_string 不能为空" };
  if (oldString === newString) return { ok: false, error: "old_string 与 new_string 相同" };
  const nodes = parseWidgets(content).filter(n => n.name === widget);
  if (!nodes.length) return { ok: false, error: `找不到控件 "${widget}"。现有控件：${allWidgetNames(content).slice(0, 30).join(", ")}` };
  if (nodes.length > 1) return { ok: false, error: `控件名 "${widget}" 重复` };
  const n = nodes[0];
  const block = content.substring(n.start, n.end);

  const strategies = [
    oldString,
    oldString.trim(),
    oldString.split("\n").map(l => l.trim()).filter(Boolean).join("\n"),
  ];
  let matched: string | null = null;
  for (const s of strategies) {
    const count = countOccurrences(block, s);
    if (count === 1) { matched = s; break; }
    if (count > 1) return { ok: false, error: `${widget} 内匹配到 ${count} 处，请提供更精确的上下文` };
  }
  if (!matched) {
    const fuzzy = fuzzyMatch(block, oldString);
    if (fuzzy) matched = fuzzy;
  }
  if (!matched) {
    return { ok: false, error: `在 ${widget} 内找不到 old_string。控件片段：\n${block.slice(0, 600)}` };
  }

  const newBlock = block.replace(matched, newString);
  const oldW = (block.match(/<widget\b/g) || []).length;
  const newW = (newBlock.match(/<widget\b/g) || []).length;
  const oldL = (block.match(/<layout\b/g) || []).length;
  const newL = (newBlock.match(/<layout\b/g) || []).length;
  if (oldW !== newW || oldL !== newL) {
    return { ok: false, error: `替换破坏了控件结构（widget ${oldW}→${newW}，layout ${oldL}→${newL}）。old_string 不要包含控件/布局标签本身。` };
  }
  const next = content.slice(0, n.start) + newBlock + content.slice(n.end);
  const err = validateUi(next);
  if (err) return { ok: false, error: err };
  return { ok: true, content: next };
}

export function addWidget(
  content: string,
  parent: string,
  xml: string
): { ok: boolean; content?: string; error?: string } {
  const nodes = parseWidgets(content).filter(n => n.name === parent);
  if (!nodes.length) return { ok: false, error: `找不到父控件 "${parent}"` };
  if (nodes.length > 1) return { ok: false, error: `父控件名 "${parent}" 重复` };
  const node = nodes[0];
  if (node.selfClosing) return { ok: false, error: `父控件 ${parent} 是自闭合标签，请先用 ui_set_property 给它加属性` };
  const frag = xml.trim();
  if (!/^<widget\b/.test(frag) || !/<\/widget>\s*$/.test(frag)) {
    return { ok: false, error: "xml 必须是完整的一段 <widget ...>...</widget>" };
  }
  const fragName = (frag.match(/<widget[^>]*name="([^"]+)"/) || [])[1];
  if (fragName && allWidgetNames(content).includes(fragName)) {
    return { ok: false, error: `控件名 "${fragName}" 已存在，请换一个` };
  }
  const fragErr = validateUi(`<ui version="4.0"><class>X</class>${frag}</ui>`);
  if (fragErr) return { ok: false, error: "片段格式错误：" + fragErr };

  const block = content.substring(node.openStart, node.end);
  const parentIndent = indentOf(content, node.openStart);
  let insertAt = -1;
  let itemIndent = "";
  let bodyIndent = "";
  let wrapItem = false;

  // 优先塞进父控件内的 layout
  const layoutStart = block.indexOf("<layout");
  if (layoutStart >= 0) {
    const layoutEndRel = findClosingTag(block, layoutStart, "layout");
    if (layoutEndRel > layoutStart) {
      const absClose = node.openStart + layoutEndRel;
      insertAt = lineStartAbs(content, absClose);
      itemIndent = indentOf(content, absClose) + " ";
      bodyIndent = itemIndent + " ";
      wrapItem = true;
    }
  }
  if (insertAt < 0) {
    const closeIdx = content.lastIndexOf("</widget>", node.end - 1);
    if (closeIdx < 0) return { ok: false, error: "无法定位父控件插入点" };
    insertAt = lineStartAbs(content, closeIdx);
    bodyIndent = parentIndent + " ";
  }

  const body = reindent(frag, bodyIndent);
  const insert = wrapItem
    ? `${itemIndent}<item>\n${body}\n${itemIndent}</item>\n`
    : `${body}\n`;
  const next = content.slice(0, insertAt) + insert + content.slice(insertAt);
  const err = validateUi(next);
  if (err) return { ok: false, error: err };
  return { ok: true, content: next };
}

function lineStartAbs(content: string, pos: number): number {
  return content.lastIndexOf("\n", pos - 1) + 1;
}

function findClosingTag(content: string, start: number, tag: string): number {
  const re = new RegExp(`<${tag}\\b[^>]*?(/?)>|</${tag}>`, "g");
  re.lastIndex = start;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m[0].startsWith("</")) {
      depth--;
      if (depth === 0) return m.index;
    } else if (!m[1]) {
      depth++;
    }
  }
  return -1;
}

export function removeWidget(
  content: string,
  widget: string
): { ok: boolean; content?: string; error?: string } {
  const nodes = parseWidgets(content).filter(n => n.name === widget);
  if (!nodes.length) return { ok: false, error: `找不到控件 "${widget}"` };
  if (nodes.length > 1) return { ok: false, error: `控件名 "${widget}" 重复` };
  const node = nodes[0];
  if (!node.parent) return { ok: false, error: "不能删除根控件" };

  let start = node.start;
  let end = node.end;

  // 如果包在 layout 的 <item> 里，连 item 一起删
  const before = content.lastIndexOf("<item", start);
  const closingItem = content.lastIndexOf("</item>", start);
  if (before >= 0 && before > closingItem) {
    const itemEnd = content.indexOf("</item>", end);
    if (itemEnd >= 0) {
      start = before;
      end = itemEnd + "</item>".length;
    }
  }
  // 带走前面的缩进和空行
  const lineStart = content.lastIndexOf("\n", start - 1) + 1;
  if (/^[ \t]*$/.test(content.slice(lineStart, start))) start = lineStart;

  const next = content.slice(0, start) + content.slice(end).replace(/^\r?\n/, "");
  const err = validateUi(next);
  if (err) return { ok: false, error: err };
  return { ok: true, content: next };
}

function countOccurrences(str: string, sub: string): number {
  let count = 0, pos = 0;
  while ((pos = str.indexOf(sub, pos)) !== -1) { count++; pos += sub.length || 1; }
  return count;
}

function fuzzyMatch(block: string, oldString: string): string | null {
  const oldLines = oldString.split("\n").map(l => l.trim()).filter(Boolean);
  if (!oldLines.length) return null;
  const lines = block.split("\n");
  for (let i = 0; i <= lines.length - oldLines.length; i++) {
    let ok = true;
    for (let j = 0; j < oldLines.length; j++) {
      if (lines[i + j].trim() !== oldLines[j]) { ok = false; break; }
    }
    if (ok) return lines.slice(i, i + oldLines.length).join("\n");
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
