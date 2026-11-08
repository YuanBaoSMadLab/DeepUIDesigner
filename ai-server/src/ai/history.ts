import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export interface Revision {
  id: string;
  time: string;
  tool: string;
  widget?: string;
  summary: string;
  sessionId?: string;
  beforeFile: string;
  afterFile: string;
  bytes: number;
}

interface RevisionIndex {
  revisions: Revision[];
  sessions: Record<string, { time: string; file: string; label: string }>;
}

const MAX_REVISIONS = 60;

export function historyDir(filePath: string): string {
  const abs = path.resolve(filePath);
  const hash = crypto.createHash("sha1").update(abs).digest("hex").slice(0, 8);
  const name = path.basename(abs, path.extname(abs)).replace(/[^\w\u4e00-\u9fa5-]/g, "_");
  return path.join(path.dirname(abs), ".omnidesigner", "history", `${name}-${hash}`);
}

function indexPath(filePath: string): string {
  return path.join(historyDir(filePath), "index.json");
}

function ensureDir(filePath: string): string {
  const dir = historyDir(filePath);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readIndex(filePath: string): RevisionIndex {
  const p = indexPath(filePath);
  if (!fs.existsSync(p)) return { revisions: [], sessions: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as RevisionIndex;
    return {
      revisions: Array.isArray(raw.revisions) ? raw.revisions : [],
      sessions: raw.sessions || {},
    };
  } catch {
    return { revisions: [], sessions: {} };
  }
}

function writeIndex(filePath: string, index: RevisionIndex): void {
  ensureDir(filePath);
  fs.writeFileSync(indexPath(filePath), JSON.stringify(index, null, 2), "utf-8");
}

function nextId(index: RevisionIndex): string {
  const n = index.revisions.length + 1;
  return `${Date.now().toString(36)}-${n.toString().padStart(3, "0")}`;
}

export function recordRevision(
  filePath: string,
  beforeContent: string,
  afterContent: string,
  meta: { tool: string; widget?: string; summary: string; sessionId?: string }
): Revision {
  const dir = ensureDir(filePath);
  const index = readIndex(filePath);
  const id = nextId(index);
  const beforeFile = path.join(dir, `rev-${id}-before.ui`);
  const afterFile = path.join(dir, `rev-${id}-after.ui`);
  fs.writeFileSync(beforeFile, beforeContent, "utf-8");
  fs.writeFileSync(afterFile, afterContent, "utf-8");
  const rev: Revision = {
    id,
    time: new Date().toISOString(),
    tool: meta.tool,
    widget: meta.widget,
    summary: meta.summary,
    sessionId: meta.sessionId,
    beforeFile,
    afterFile,
    bytes: Buffer.byteLength(afterContent, "utf-8"),
  };
  index.revisions.push(rev);

  while (index.revisions.length > MAX_REVISIONS) {
    const old = index.revisions.shift()!;
    safeUnlink(old.beforeFile);
    safeUnlink(old.afterFile);
  }
  writeIndex(filePath, index);
  return rev;
}

function safeUnlink(p: string): void {
  try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
}

export function listRevisions(filePath: string): Revision[] {
  return readIndex(filePath).revisions.slice().reverse().map(r => ({
    ...r,
    beforeFile: path.basename(r.beforeFile),
    afterFile: path.basename(r.afterFile),
  }));
}

export function getRevision(filePath: string, id: string): Revision | undefined {
  return readIndex(filePath).revisions.find(r => r.id === id);
}

export function beginSession(filePath: string, sessionId: string): { id: string; time: string; already: boolean } {
  const index = readIndex(filePath);
  if (index.sessions[sessionId] && fs.existsSync(index.sessions[sessionId].file)) {
    return { id: sessionId, time: index.sessions[sessionId].time, already: true };
  }
  const dir = ensureDir(filePath);
  const file = path.join(dir, `session-${sessionId.replace(/[^\w-]/g, "_")}.ui`);
  fs.copyFileSync(filePath, file);
  const time = new Date().toISOString();
  index.sessions[sessionId] = { time, file, label: "本次对话前" };
  writeIndex(filePath, index);
  return { id: sessionId, time, already: false };
}

export function revertSession(filePath: string, sessionId: string): boolean {
  const index = readIndex(filePath);
  const s = index.sessions[sessionId];
  if (!s || !fs.existsSync(s.file)) return false;
  const before = readFileSafe(filePath);
  const restored = fs.readFileSync(s.file, "utf-8");
  recordRevision(filePath, before, restored, {
    tool: "revert-session",
    summary: "恢复到本次对话前",
    sessionId,
  });
  fs.writeFileSync(filePath, restored, "utf-8");
  return true;
}

export function revertToRevision(filePath: string, id: string): { ok: boolean; error?: string; revision?: Revision } {
  const rev = getRevision(filePath, id);
  if (!rev) return { ok: false, error: "找不到该历史版本" };
  if (!fs.existsSync(rev.beforeFile)) return { ok: false, error: "版本快照已丢失" };
  const current = readFileSafe(filePath);
  const restored = fs.readFileSync(rev.beforeFile, "utf-8");
  const newRev = recordRevision(filePath, current, restored, {
    tool: "revert",
    summary: `回退到版本 ${id}`,
  });
  fs.writeFileSync(filePath, restored, "utf-8");
  return { ok: true, revision: newRev };
}

export function revertLast(filePath: string): { ok: boolean; error?: string; revision?: Revision } {
  const list = listRevisions(filePath);
  const last = list.find(r => r.tool !== "manual" && r.tool !== "revert");
  if (!last) return { ok: false, error: "没有可回退的修改" };
  return revertToRevision(filePath, last.id);
}

export function snapshotManual(filePath: string, label = "手动快照"): Revision {
  const content = readFileSafe(filePath);
  return recordRevision(filePath, content, content, { tool: "manual", summary: label });
}

function readFileSafe(p: string): string {
  try { return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : ""; } catch { return ""; }
}

export function readRevisionFile(filePath: string, id: string, side: "before" | "after"): string | null {
  const rev = getRevision(filePath, id);
  if (!rev) return null;
  const file = side === "before" ? rev.beforeFile : rev.afterFile;
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf-8");
}

/** 生成简化 unified diff，忽略过长文件 */
export function makeDiff(before: string, after: string, maxLines = 1600): string {
  const a = before.split(/\r?\n/).slice(0, maxLines);
  const b = after.split(/\r?\n/).slice(0, maxLines);
  if (a.length === 1 && b.length === 1 && a[0] === b[0]) return "无差异";

  const n = a.length, m = b.length;
  if (n * m > 4_000_000) return "文件较大，差异省略。可直接回退或查看快照。";

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: Array<{ type: " " | "-" | "+"; line: string }> = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ type: " ", line: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ type: "-", line: a[i] }); i++; }
    else { ops.push({ type: "+", line: b[j] }); j++; }
  }
  while (i < n) ops.push({ type: "-", line: a[i++] });
  while (j < m) ops.push({ type: "+", line: b[j++] });

  const changed = ops.some(o => o.type !== " ");
  if (!changed) return "无差异";

  // 只保留变更附近 3 行上下文
  const keep = new Array(ops.length).fill(false);
  ops.forEach((o, idx) => {
    if (o.type !== " ") {
      for (let k = Math.max(0, idx - 3); k <= Math.min(ops.length - 1, idx + 3); k++) keep[k] = true;
    }
  });
  const out: string[] = [];
  let last = -2;
  ops.forEach((o, idx) => {
    if (!keep[idx]) return;
    if (idx !== last + 1) out.push("@@");
    out.push(`${o.type}${o.line}`);
    last = idx;
  });
  return out.join("\n");
}
