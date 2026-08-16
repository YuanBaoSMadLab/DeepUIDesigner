import * as fs from "fs";
import * as path from "path";

const BACKUP_SUFFIX = ".omniback";
const MAX_BACKUPS = 5;

/** 从 AI 响应中提取 XML patch 内容 */
export function extractXmlPatch(aiResponse: string): string | null {
  // 尝试匹配 ```xml ... ``` 代码块
  const xmlBlockMatch = aiResponse.match(/```xml\s*([\s\S]*?)```/);
  if (xmlBlockMatch) {
    return xmlBlockMatch[1].trim();
  }

  // 尝试匹配 <widget 或 <property 开头的片段
  const widgetMatch = aiResponse.match(/(<widget[\s\S]*?<\/widget>)/);
  if (widgetMatch) {
    return widgetMatch[1].trim();
  }

  const propertyMatch = aiResponse.match(/(<property[\s\S]*?<\/property>)/);
  if (propertyMatch) {
    return propertyMatch[1].trim();
  }

  return null;
}

/** 创建备份文件 */
export function createBackup(uiFilePath: string): string {
  const backupPath = uiFilePath + BACKUP_SUFFIX + ".0";
  fs.copyFileSync(uiFilePath, backupPath);

  // 轮转旧备份：.0 → .1 → .2 → .3 → .4
  for (let i = MAX_BACKUPS - 1; i >= 0; i--) {
    const oldPath = uiFilePath + BACKUP_SUFFIX + "." + i;
    const newPath = uiFilePath + BACKUP_SUFFIX + "." + (i + 1);
    if (fs.existsSync(oldPath)) {
      if (i === MAX_BACKUPS - 1) {
        fs.unlinkSync(oldPath);
      } else {
        fs.renameSync(oldPath, newPath);
      }
    }
  }

  return backupPath;
}

/** 回退到最近备份 */
export function revertToBackup(uiFilePath: string): boolean {
  const latestBackup = uiFilePath + BACKUP_SUFFIX + ".0";
  if (!fs.existsSync(latestBackup)) {
    return false;
  }
  fs.copyFileSync(latestBackup, uiFilePath);
  return true;
}

/** 将 AI 修改写入 .UI 文件 */
export function applyChanges(
  uiFilePath: string,
  xmlPatch: string
): { success: boolean; error?: string } {
  try {
    createBackup(uiFilePath);

    let content = fs.readFileSync(uiFilePath, "utf-8");

    // 解析 patch：提取 widget name 和要修改的属性
    const widgetName = extractWidgetName(xmlPatch);
    const properties = extractProperties(xmlPatch);

    if (!widgetName || properties.length === 0) {
      return { success: false, error: "无法从AI返回中解析出有效的修改内容" };
    }

    // 对每个属性进行替换或插入
    for (const prop of properties) {
      content = applyPropertyChange(content, widgetName, prop.name, prop.value);
    }

    fs.writeFileSync(uiFilePath, content, "utf-8");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

interface PropertyChange {
  name: string;
  value: string;
}

function extractWidgetName(xml: string): string | null {
  const match = xml.match(/<widget[^>]*name="([^"]*)"/);
  return match ? match[1] : null;
}

function extractProperties(xml: string): PropertyChange[] {
  const results: PropertyChange[] = [];
  // 匹配 <property name="...">...</property>，支持任意嵌套子元素
  const propRegex = /<property\s+name="([^"]*)"\s*>([\s\S]*?)<\/property>/g;
  let match;
  while ((match = propRegex.exec(xml)) !== null) {
    const propName = match[1];
    const innerXml = match[2].trim();
    // 提取内部值：去掉外层标签，获取实际内容
    // 例如: <string>OK</string> → OK
    //       <number>42</number> → 42
    //       <bool>true</bool> → true
    //       <rect><x>0</x>...</rect> → 保留完整嵌套子元素
    const valueMatch = innerXml.match(/^<(\w+)[^>]*>([\s\S]*)<\/\1>$/);
    if (valueMatch) {
      // 如果内部还包含子元素标签，保留完整 innerXml
      const hasChildren = /<(\w+)[^>]*>[\s\S]*<\/\1>/.test(valueMatch[2]);
      results.push({
        name: propName,
        value: hasChildren ? innerXml : valueMatch[2],
      });
    } else {
      results.push({ name: propName, value: innerXml });
    }
  }
  return results;
}

function applyPropertyChange(
  content: string,
  widgetName: string,
  propertyName: string,
  newValue: string
): string {
  const widgetPattern = `<widget[^>]*name="${escapeRegex(widgetName)}"[^>]*>`;
  const widgetRegex = new RegExp(`(${widgetPattern}[\\s\\S]*?)(</widget>)`, "g");
  const widgetMatch = widgetRegex.exec(content);

  if (!widgetMatch) {
    return content; // widget 未找到，不做修改
  }

  const widgetBlock = widgetMatch[1];
  const widgetEnd = widgetMatch[2];
  const widgetStart = content.indexOf(widgetBlock);

  const propRegex = new RegExp(
    `(<property\\s+name="${escapeRegex(propertyName)}"[^>]*>[\\s\\S]*?</property>)`,
    "g"
  );

  let newWidgetBlock: string;
  if (propRegex.test(widgetBlock)) {
    // 已有该属性，替换
    propRegex.lastIndex = 0;
    const oldProp = propRegex.exec(widgetBlock)?.[1] || "";
    const newProp = buildPropertyXml(propertyName, newValue);
    newWidgetBlock = widgetBlock.replace(oldProp, newProp);
  } else {
    // 没有该属性，在 </widget> 前插入
    const newProp = buildPropertyXml(propertyName, newValue);
    newWidgetBlock = widgetBlock + "\n   " + newProp + "\n  ";
  }

  return content.substring(0, widgetStart) + newWidgetBlock + widgetEnd +
         content.substring(widgetStart + widgetBlock.length + widgetEnd.length);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 根据属性名和值构建 property XML 元素 */
function buildPropertyXml(name: string, value: string): string {
  // 判断值的类型：如果以 < 开头认为是嵌套 XML，否则是文本
  if (value.startsWith("<")) {
    return `<property name="${name}">\n    ${value}\n   </property>`;
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return `<property name="${name}">\n    <number>${value}</number>\n   </property>`;
  }
  if (value === "true" || value === "false") {
    return `<property name="${name}">\n    <bool>${value}</bool>\n   </property>`;
  }
  // 剩下的都当字符串
  return `<property name="${name}">\n    <string>${escapeXml(value)}</string>\n   </property>`;
}
