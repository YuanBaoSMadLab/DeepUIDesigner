import * as fs from "fs";

const BACKUP_SUFFIX = ".omniback";
const MAX_BACKUPS = 5;
const PRECHAT_SUFFIX = ".omniback.prechat";

export interface BackupMeta {
  level: number;
  time: string;
  label: string;
}

function metaPath(filePath: string): string {
  return filePath + BACKUP_SUFFIX + ".json";
}

function readMeta(filePath: string): BackupMeta[] {
  const mp = metaPath(filePath);
  if (!fs.existsSync(mp)) return [];
  try {
    return JSON.parse(fs.readFileSync(mp, "utf-8"));
  } catch {
    return [];
  }
}

function writeMeta(filePath: string, meta: BackupMeta[]): void {
  fs.writeFileSync(metaPath(filePath), JSON.stringify(meta), "utf-8");
}

/** 列出所有备份 */
export function listBackups(filePath: string): BackupMeta[] {
  const all = readMeta(filePath);
  // 只保留文件实际存在的
  return all.filter(b => fs.existsSync(filePath + BACKUP_SUFFIX + "." + b.level));
}

/** 创建备份（带标签） */
export function createBackup(filePath: string, label: string = "自动备份"): string {
  const meta = readMeta(filePath);

  // 滚动重命名
  for (let i = MAX_BACKUPS - 1; i >= 0; i--) {
    const oldPath = filePath + BACKUP_SUFFIX + "." + i;
    const newPath = filePath + BACKUP_SUFFIX + "." + (i + 1);
    if (fs.existsSync(oldPath)) {
      if (i === MAX_BACKUPS - 1) {
        fs.unlinkSync(oldPath);
      } else {
        fs.renameSync(oldPath, newPath);
      }
    }
  }

  // 写入 level 0
  const backupPath = filePath + BACKUP_SUFFIX + ".0";
  fs.copyFileSync(filePath, backupPath);

  // 更新元数据：旧记录 level+1，新记录 level 0
  const newMeta: BackupMeta[] = [{ level: 0, time: new Date().toISOString(), label }];
  for (const b of meta) {
    const newLevel = b.level + 1;
    if (newLevel < MAX_BACKUPS) {
      newMeta.push({ ...b, level: newLevel });
    }
  }
  writeMeta(filePath, newMeta);
  return backupPath;
}

/** 还原到指定备份 */
export function revertToBackup(filePath: string, level: number = 0): boolean {
  const backupPath = filePath + BACKUP_SUFFIX + "." + level;
  if (!fs.existsSync(backupPath)) return false;
  fs.copyFileSync(backupPath, filePath);
  return true;
}

/** 删除指定备份（重新编号以保持连续性） */
export function deleteBackup(filePath: string, level: number): boolean {
  const backupPath = filePath + BACKUP_SUFFIX + "." + level;
  if (!fs.existsSync(backupPath)) return false;
  fs.unlinkSync(backupPath);

  const meta = readMeta(filePath).filter(b => b.level !== level);
  const sorted = meta.sort((a, b) => a.level - b.level);
  for (const b of sorted) {
    if (b.level > level) {
      const oldPath = filePath + BACKUP_SUFFIX + "." + b.level;
      b.level--;
      const newPath = filePath + BACKUP_SUFFIX + "." + b.level;
      if (fs.existsSync(oldPath)) fs.renameSync(oldPath, newPath);
    }
  }
  writeMeta(filePath, sorted);
  return true;
}

/** 读取 UI 文件内容 */
export function readUiFile(filePath: string): string {
  if (!filePath || !fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf-8");
}

/** 对话前自动备份：保存当前文件状态，不参与滚动备份 */
export function createPreChatBackup(filePath: string): void {
  if (!filePath || !fs.existsSync(filePath)) return;
  const preChatPath = filePath + PRECHAT_SUFFIX;
  fs.copyFileSync(filePath, preChatPath);
}

/** 恢复到对话前状态 */
export function revertToPreChatBackup(filePath: string): boolean {
  if (!filePath) return false;
  const preChatPath = filePath + PRECHAT_SUFFIX;
  if (!fs.existsSync(preChatPath)) return false;
  fs.copyFileSync(preChatPath, filePath);
  return true;
}

/** 检查对话前备份是否存在 */
export function hasPreChatBackup(filePath: string): boolean {
  return fs.existsSync(filePath + PRECHAT_SUFFIX);
}

/** 校验 .ui XML 的常见错误，返回 null 表示通过，否则返回错误信息 */
function validateUiXml(content: string): string | null {
  // 检测：widget 标签上的非法属性 align
  if (/<widget[^>]*\salign\s*=/.test(content)) {
    return "格式错误: 禁止在 <widget> 上使用 align 属性。请使用 <property name=\"alignment\"><set>Qt::AlignCenter</set></property>";
  }
  // 检测：使用了不存在的 <enum> 标签
  if (/<enum>/.test(content)) {
    return "格式错误: 禁止使用 <enum> 标签。枚举值请使用 <set>Qt::EnumName</set>";
  }
  // 检测：set 中的枚举值缺少 Qt:: 前缀
  const setMatch = content.match(/<set>([^<]+)<\/set>/g);
  if (setMatch) {
    for (const m of setMatch) {
      const val = m.replace(/<\/?set>/g, "");
      if (/^[A-Z]/.test(val) && !val.startsWith("Qt::") && val !== "true" && val !== "false" && !/^\d/.test(val)) {
        return `格式错误: <set> 中的枚举值 "${val}" 缺少 Qt:: 前缀。请使用 Qt::${val}`;
      }
    }
  }
  // 检测：基本 XML 格式 — 标签不匹配
  const openTags = content.match(/<\w+/g) || [];
  const closeTags = content.match(/<\/\w+/g) || [];
  if (openTags.length !== closeTags.length) {
    return "格式错误: XML 标签不匹配，可能缺少闭合标签";
  }
  // 检测：geometry 使用了逗号分隔格式（常见于 AI 随意生成）
  if (/<rect>\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*<\/rect>/.test(content)) {
    return "格式错误: geometry 的 rect 不能使用逗号分隔格式。请使用 <rect><x>0</x><y>0</y><width>100</width><height>30</height></rect>";
  }
  return null;
}

/** 替换整个文件 */
export function writeUiFile(
  filePath: string,
  content: string
): { success: boolean; message?: string; error?: string } {
  try {
    if (!filePath) return { success: false, error: "文件路径为空" };

    const validationError = validateUiXml(content);
    if (validationError) {
      return { success: false, error: validationError };
    }

    fs.writeFileSync(filePath, content, "utf-8");
    return { success: true, message: "文件已更新" };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * 在指定 widget 内做字符串替换。
 * 支持多级宽松匹配：完全匹配 → trim → 规范化空白 → 逐行模糊匹配
 */
export function applyEdit(
  filePath: string,
  widgetName: string,
  oldString: string,
  newString: string
): { success: boolean; message?: string; error?: string } {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: "文件不存在" };
    }
    if (!oldString) {
      return { success: false, error: "old_string 不能为空" };
    }
    if (oldString === newString) {
      return { success: false, error: "old_string 和 newString 相同" };
    }

    const content = fs.readFileSync(filePath, "utf-8");

    let nameRegex = new RegExp(
      `<widget[^>]*name="${escapeRegex(widgetName)}"[^>]*>`
    );
    let nameMatch = content.match(nameRegex);
    if (!nameMatch) {
      nameRegex = new RegExp(
        `<widget[^>]*name='${escapeRegex(widgetName)}'[^>]*>`
      );
      nameMatch = content.match(nameRegex);
    }
    if (!nameMatch) {
      const allNames: string[] = [];
      const nameFinder = /<widget[^>]*name="([^"]*)"[^>]*>/g;
      let m;
      while ((m = nameFinder.exec(content)) !== null) allNames.push(m[1]);
      return {
        success: false,
        error: `找不到 name="${widgetName}"。文件中控件: [${allNames.join(", ")}]`,
      };
    }

    const widgetStart = nameMatch.index!;
    let depth = 0;
    let widgetEnd = -1;

    const tagEnd = content.indexOf(">", widgetStart);
    if (content[tagEnd - 1] === "/") {
      widgetEnd = tagEnd + 1;
    } else {
      const widgetRegex = /<widget[^>]*>|<\/widget>/g;
      widgetRegex.lastIndex = widgetStart;
      let match;
      while ((match = widgetRegex.exec(content)) !== null) {
        if (match[0].startsWith("</")) {
          depth--;
          if (depth === 0) {
            widgetEnd = match.index + match[0].length;
            break;
          }
        } else {
          depth++;
        }
      }
    }

    if (widgetEnd === -1) {
      return { success: false, error: "无法找到 widget 的结束标签" };
    }

    const widgetBlock = content.substring(widgetStart, widgetEnd);

    // 多级匹配策略（从严格到宽松）
    const strategies = [
      { name: "exact", match: oldString },
      { name: "trimmed", match: oldString.trim() },
      { name: "normalized", match: normalizeXmlText(oldString) },
    ];

    let bestMatch: string | null = null;
    for (const strategy of strategies) {
      const occ = countOccurrences(widgetBlock, strategy.match);
      if (occ === 1) {
        bestMatch = strategy.match;
        break;
      }
      if (occ > 1) {
        return {
          success: false,
          error: `old_string 在 ${widgetName} 内出现了 ${occ} 次（${strategy.name}匹配），请提供更精确的上下文。`,
        };
      }
    }

    if (!bestMatch) {
      // 最后尝试：逐行忽略空白匹配
      const fuzzyResult = fuzzyMatch(widgetBlock, oldString);
      if (fuzzyResult) {
        bestMatch = fuzzyResult;
      } else {
        const preview = widgetBlock.substring(0, 500);
        return {
          success: false,
          error: `在 ${widgetName} 内找不到匹配文本。控件内容预览:\n${preview}${widgetBlock.length > 500 ? "..." : ""}`,
        };
      }
    }

    const newWidgetBlock = widgetBlock.replace(bestMatch, newString);
    const newContent =
      content.substring(0, widgetStart) + newWidgetBlock + content.substring(widgetEnd);

    // 后期校验：替换后 widget 和 layout 数量必须一致
    const oldWidgetCount = (content.match(/<widget/g) || []).length;
    const newWidgetCount = (newContent.match(/<widget/g) || []).length;
    const oldLayoutCount = (content.match(/<layout/g) || []).length;
    const newLayoutCount = (newContent.match(/<layout/g) || []).length;
    if (oldWidgetCount !== newWidgetCount || oldLayoutCount !== newLayoutCount) {
      return {
        success: false,
        error: `替换破坏了 XML 结构！widget 数量 ${oldWidgetCount}→${newWidgetCount}，layout 数量 ${oldLayoutCount}→${newLayoutCount}。请确保 old_string 只包含目标控件内部内容，不要包含 widget 标签本身或父级 layout/item 标签。`,
      };
    }

    fs.writeFileSync(filePath, newContent, "utf-8");
    return { success: true, message: `已修改 ${widgetName} 控件` };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/** 规范化 XML 文本：统一缩进和空白 */
function normalizeXmlText(s: string): string {
  return s
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

/**
 * 模糊匹配：将 oldString 的每一行去除空白后逐行匹配，
 * 找到后返回 widgetBlock 中对应的原始文本（保留原缩进）
 */
function fuzzyMatch(widgetBlock: string, oldString: string): string | null {
  const oldLines = oldString.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (oldLines.length === 0) return null;

  const blockLines = widgetBlock.split("\n");
  for (let i = 0; i <= blockLines.length - oldLines.length; i++) {
    let matched = true;
    for (let j = 0; j < oldLines.length; j++) {
      if (blockLines[i + j].trim() !== oldLines[j]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return blockLines.slice(i, i + oldLines.length).join("\n");
    }
  }
  return null;
}

function countOccurrences(str: string, sub: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = str.indexOf(sub, pos)) !== -1) {
    count++;
    pos += sub.length || 1;
  }
  return count;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
