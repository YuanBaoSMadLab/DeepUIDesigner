export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WidgetNode {
  name: string;
  cls: string;
  parent: string | null;
  depth: number;
  start: number;
  end: number;
  openStart: number;
  openEnd: number;
  selfClosing: boolean;
  geometry: Rect | null;
  abs: Rect;
  visible: boolean;
  enabled: boolean;
  hasLayout: boolean;
  interactive: boolean;
  text?: string;
}

export interface LayoutIssue {
  severity: "error" | "warn" | "info";
  code: string;
  widget: string;
  message: string;
  other?: string;
  rect?: Rect;
}

const INTERACTIVE = new Set([
  "QPushButton", "QToolButton", "QRadioButton", "QCheckBox", "QLineEdit",
  "QTextEdit", "QPlainTextEdit", "QComboBox", "QSpinBox", "QDoubleSpinBox",
  "QSlider", "QScrollBar", "QTabWidget", "QTabBar", "QMenuBar", "QToolBar",
  "QTableView", "QTreeView", "QListView", "QListWidget", "QTableWidget",
  "QTreeWidget", "QWebEngineView", "QCalendarWidget",
]);

export function parseWidgets(content: string): WidgetNode[] {
  const nodes: WidgetNode[] = [];
  const byName = new Map<string, WidgetNode>();
  const stack: WidgetNode[] = [];
  const re = /<widget\b[^>]*>|<\/widget>/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(content)) !== null) {
    const tag = m[0];
    if (tag.startsWith("</")) {
      const node = stack.pop();
      if (node) node.end = m.index + tag.length;
      continue;
    }
    const name = attr(tag, "name") || "";
    const cls = attr(tag, "class") || "";
    const selfClosing = /\/>\s*$/.test(tag);
    const parent = stack.length ? stack[stack.length - 1] : null;
    const node: WidgetNode = {
      name,
      cls,
      parent: parent?.name || null,
      depth: stack.length,
      start: m.index,
      end: m.index + tag.length,
      openStart: m.index,
      openEnd: m.index + tag.length,
      selfClosing,
      geometry: null,
      abs: { x: 0, y: 0, w: 0, h: 0 },
      visible: true,
      enabled: true,
      hasLayout: false,
      interactive: INTERACTIVE.has(cls),
    };
    nodes.push(node);
    if (name) byName.set(name, node);
    if (!selfClosing) stack.push(node);
  }

  for (const node of nodes) {
    const block = content.substring(node.openStart, node.end);
    node.geometry = extractGeometry(block);
    node.visible = !/<property\s+name="visible"\s*>\s*<bool>false<\/bool>/.test(block);
    node.enabled = !/<property\s+name="enabled"\s*>\s*<bool>false<\/bool>/.test(block);
    node.hasLayout = /<layout\b/.test(block);
    node.text = extractText(block);
  }

  // 相对坐标叠成绝对坐标
  const resolve = (node: WidgetNode, seen = new Set<string>()): Rect => {
    if (seen.has(node.name)) return node.geometry || { x: 0, y: 0, w: 0, h: 0 };
    seen.add(node.name);
    const g = node.geometry || { x: 0, y: 0, w: 0, h: 0 };
    if (!node.parent) return { ...g };
    const p = byName.get(node.parent);
    if (!p) return { ...g };
    const pr = resolve(p, seen);
    return { x: pr.x + g.x, y: pr.y + g.y, w: g.w, h: g.h };
  };
  for (const node of nodes) node.abs = resolve(node);
  return nodes;
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`)) || tag.match(new RegExp(`${name}='([^']*)'`));
  return m ? m[1] : null;
}

function extractGeometry(block: string): Rect | null {
  const pm = block.match(/<property\s+name="geometry"\s*>([\s\S]*?)<\/property>/);
  if (!pm) return null;
  const body = pm[1];
  const n = (tag: string) => {
    const m = body.match(new RegExp(`<${tag}>\\s*(-?\\d+)\\s*</${tag}>`));
    return m ? parseInt(m[1], 10) : null;
  };
  const x = n("x"), y = n("y"), w = n("width"), h = n("height");
  if (x !== null && y !== null && w !== null && h !== null) return { x, y, w, h };
  const legacy = body.match(/<rect>\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*<\/rect>/);
  if (legacy) return { x: +legacy[1], y: +legacy[2], w: +legacy[3], h: +legacy[4] };
  return null;
}

function extractText(block: string): string | undefined {
  const m = block.match(/<property\s+name="text"\s*>\s*<string[^>]*>([\s\S]*?)<\/string>/);
  return m ? m[1] : undefined;
}

function intersect(a: Rect, b: Rect): { w: number; h: number; area: number } {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return { w, h, area: w * h };
}

export function checkLayout(content: string): LayoutIssue[] {
  const nodes = parseWidgets(content);
  const issues: LayoutIssue[] = [];
  const byName = new Map(nodes.filter(n => n.name).map(n => [n.name, n]));
  const dup = new Map<string, number>();
  for (const n of nodes) dup.set(n.name, (dup.get(n.name) || 0) + 1);
  for (const [name, count] of dup) {
    if (name && count > 1) {
      issues.push({ severity: "error", code: "duplicate-name", widget: name, message: `控件名重复 ${count} 次，设计器无法稳定定位` });
    }
  }

  for (const n of nodes) {
    if (n.parent) {
      const p = byName.get(n.parent);
      if (p && n.visible && n.geometry) {
        const parentR = { x: 0, y: 0, w: p.abs.w, h: p.abs.h };
        const childR = { x: n.abs.x - p.abs.x, y: n.abs.y - p.abs.y, w: n.abs.w, h: n.abs.h };
        if (p.hasLayout) {
          // 有布局时 geometry 只作为建议值，不做越界判断
        } else if (n.abs.w > 0 && n.abs.h > 0 &&
          (childR.x < -2 || childR.y < -2 ||
            childR.x + childR.w > parentR.w + 2 || childR.y + childR.h > parentR.h + 2)) {
          issues.push({
            severity: "warn",
            code: "out-of-bounds",
            widget: n.name,
            other: p.name,
            message: `超出父容器 ${p.name} 边界，运行时可能被裁剪`,
            rect: n.abs,
          });
        }
      }
      if (p?.hasLayout && n.geometry && n.geometry.w > 0 && !n.selfClosing) {
        issues.push({
          severity: "info",
          code: "fixed-geometry-in-layout",
          widget: n.name,
          other: p.name,
          message: `位于布局中但仍带固定 geometry，窗口缩放时可能挤压`,
          rect: n.abs,
        });
      }
    }

    if (n.visible && n.geometry && (n.abs.w < 8 || n.abs.h < 8) && !n.selfClosing) {
      issues.push({
        severity: "warn",
        code: "tiny-widget",
        widget: n.name,
        message: `尺寸仅 ${n.abs.w}x${n.abs.h}，可能不可见或无法点击`,
        rect: n.abs,
      });
    }
    if (n.visible && n.geometry && (n.geometry.x < -2 || n.geometry.y < -2)) {
      issues.push({
        severity: "warn",
        code: "negative-position",
        widget: n.name,
        message: `坐标为负数 (${n.geometry.x}, ${n.geometry.y})，可能跑到可视区外`,
        rect: n.abs,
      });
    }
  }

  // 同父级重叠 / 遮挡
  const groups = new Map<string, WidgetNode[]>();
  for (const n of nodes) {
    if (!n.visible || !n.geometry || n.abs.w <= 0 || n.abs.h <= 0) continue;
    const key = n.parent || "__root__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(n);
  }
  for (const [key, list] of groups) {
    // 布局容器由 Qt 自动排版，固定 geometry 只作为参考，不做重叠误报
    if (key !== "__root__") {
      const parentNode = byName.get(key);
      if (parentNode?.hasLayout) continue;
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const it = intersect(a.abs, b.abs);
        if (it.area <= 0) continue;
        const smallArea = Math.min(a.abs.w * a.abs.h, b.abs.w * b.abs.h);
        const ratio = smallArea > 0 ? it.area / smallArea : 0;
        const aInB = it.area >= (a.abs.w * a.abs.h) * 0.9;
        const bInA = it.area >= (b.abs.w * b.abs.h) * 0.9;
        if (ratio < 0.15) continue;
        const masked = (aInB || bInA) && (a.interactive || b.interactive);
        issues.push({
          severity: masked ? "error" : "warn",
          code: masked ? "occlusion" : "overlap",
          widget: b.name,
          other: a.name,
          message: masked
            ? `${b.name} 与 ${a.name} 重叠 ${Math.round(ratio * 100)}%，可能被遮挡导致无法点击`
            : `${b.name} 与 ${a.name} 重叠 ${Math.round(ratio * 100)}%`,
          rect: { x: Math.max(a.abs.x, b.abs.x), y: Math.max(a.abs.y, b.abs.y), w: it.w, h: it.h },
        });
      }
    }
  }

  // 根容器完全固定布局
  const root = nodes.find(n => n.parent === null);
  if (root && !root.hasLayout && nodes.length > 4) {
    issues.push({
      severity: "info",
      code: "no-layout",
      widget: root.name,
      message: "根容器没有使用布局，窗口缩放时控件不会自动调整",
    });
  }

  const weight = { error: 0, warn: 1, info: 2 };
  issues.sort((a, b) => weight[a.severity] - weight[b.severity]);
  return issues.slice(0, 40);
}

export function summarizeTree(content: string): string {
  const nodes = parseWidgets(content);
  return nodes
    .map(n => {
      const indent = "  ".repeat(n.depth);
      const g = n.geometry ? `${n.geometry.w}x${n.geometry.h}@${n.geometry.x},${n.geometry.y}` : "layout";
      return `${indent}${n.cls} "${n.name}" ${g}${n.text ? ` text="${n.text.slice(0, 24)}"` : ""}`;
    })
    .join("\n");
}
