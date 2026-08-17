export interface PromptContext {
  uiFilePath: string;
  uiContent: string; // deprecated, kept for compat
  selectedElement: string | null;
}

export function buildSystemPrompt(_ctx: PromptContext): string {
  return `Qt .UI file editor.

RULES:
1. ALWAYS call ui_read first to see the file contents.
2. When "[Selected: ...]" appears, that is the widget to modify. Use its name as widget_name.
3. ONLY modify the selected widget. Never touch unselected widgets.
4. For ui_edit: copy old_string EXACTLY from ui_read output — preserve ALL whitespace/indentation.
5. LAYOUT PROTECTION: Widgets inside layouts are wrapped in <item> tags. Never modify or remove <layout>, <item>, or sibling widget tags. Only edit content inside the target <widget>...</widget> block.
6. For ui_write: follow the .UI XML format rules in the tool description exactly.
7. Do NOT output XML in chat text — use tools only. Keep replies brief.`;
}

/** 构建用户消息：将文件内容和选中元素作为对话上下文注入 */
export function buildUserMessage(message: string, ctx: PromptContext): string {
  const parts = [message];
  if (ctx.uiFilePath) {
    parts.push(`[File: ${ctx.uiFilePath}. Use ui_read to see contents.]`);
  }
  if (ctx.selectedElement) {
    const summary = extractSummary(ctx.selectedElement);
    if (summary) {
      parts.push(`[Selected: ${summary}]`);
      parts.push(`[IMPORTANT: Modify ONLY this widget. Use its name as widget_name in ui_edit.]`);
    }
  }
  return parts.join("\n");
}

function extractSummary(xml: string): string {
  const classMatch = xml.match(/class="([^"]+)"/);
  const nameMatch = xml.match(/name="([^"]+)"/);
  const rectMatch = xml.match(/<rect>\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\s*<\/rect>/);

  const parts: string[] = [];

  if (classMatch) parts.push(`class=${classMatch[1]}`);
  if (nameMatch) {
    parts.push(`name="${nameMatch[1]}"`);
  } else {
    parts.push(`name="" (unnamed — locate by class and text)`);
  }

  // 文本内容是对模型识别控件最有用的线索，能抓的都抓上
  const textMatch = xml.match(/<property name="text">\s*<string>([^<]*)<\/string>/);
  const titleMatch = xml.match(/<property name="title">\s*<string>([^<]*)<\/string>/);
  const wtMatch = xml.match(/<property name="windowTitle">\s*<string>([^<]*)<\/string>/);
  const placeholderMatch = xml.match(/<property name="placeholderText">\s*<string>([^<]*)<\/string>/);
  const tooltipMatch = xml.match(/<property name="toolTip">\s*<string>([^<]*)<\/string>/);

  const labels: string[] = [];
  if (textMatch && textMatch[1]) labels.push(`text="${textMatch[1]}"`);
  if (titleMatch && titleMatch[1]) labels.push(`title="${titleMatch[1]}"`);
  if (wtMatch && wtMatch[1]) labels.push(`windowTitle="${wtMatch[1]}"`);
  if (placeholderMatch && placeholderMatch[1]) labels.push(`placeholder="${placeholderMatch[1]}"`);
  if (tooltipMatch && tooltipMatch[1]) labels.push(`tooltip="${tooltipMatch[1]}"`);
  if (labels.length > 0) parts.push(labels.join(" "));

  if (rectMatch) {
    parts.push(`rect(x=${rectMatch[1]},y=${rectMatch[2]},w=${rectMatch[3]},h=${rectMatch[4]})`);
  }

  // styleSheet 可能很长，只截前 80 字符
  const styleMatch = xml.match(/<property name="styleSheet">\s*<string>([^<]*)<\/string>/);
  if (styleMatch && styleMatch[1]) {
    const s = styleMatch[1].replace(/\s+/g, " ").trim().substring(0, 80);
    parts.push(`style="${s}${styleMatch[1].length > 80 ? "..." : ""}"`);
  }

  return parts.join(" | ");
}
