//! AI 工具 schema（ui_read / ui_edit / ui_write）。
//! description 会原样发给 DeepSeek，直接决定它怎么改 .ui 文件，别乱动。

use serde_json::{json, Value};

const UI_WRITE_DESC: &str = "Write complete XML content to the .UI file, replacing the entire file. Use only for full rewrites or new file creation. Creates a backup before writing.";

/// 组装工具 schema 数组
pub fn ui_tools() -> Value {
    json!([
        {
            "type": "function",
            "function": {
                "name": "ui_read",
                "description": "Read the current .UI file XML content. ALWAYS call this first to see what's in the file before making edits.",
                "parameters": { "type": "object", "properties": {}, "required": [] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "ui_edit",
                "description": "Edit text within a single named widget in the .UI file. Finds old_string EXACTLY inside that widget's XML block and replaces it with new_string. The old_string must be copied verbatim from ui_read output — preserve all whitespace, indentation, and line endings. Only use this for targeted changes to one widget.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "widget_name": { "type": "string", "description": "The widget's name attribute value from the .UI file, e.g. 'okButton' or 'nameInput'. Must match exactly." },
                        "old_string": { "type": "string", "description": "EXACT text to find inside the named widget's XML block. Copy VERBATIM from ui_read output. CRITICAL: old_string MUST be fully contained within the target widget's <widget>...</widget> block. Never include the widget's own opening/closing tags or any part of parent <layout>/<item> tags. If the widget is inside a layout, keep the layout's <item> wrapper untouched." },
                        "new_string": { "type": "string", "description": "Replacement text. Must be valid .UI XML using same indentation as old_string. Follow Qt .UI format: <string> for text, <bool>true/false</bool> for booleans, <number> for numbers, <set>Qt::EnumName</set> for enums, <rect><x>0</x>... for geometry. Qt enums MUST have 'Qt::' prefix. CRITICAL: never alter parent <layout>, <item>, or sibling widgets. Only edit inside the target widget's <widget> block." }
                    },
                    "required": ["widget_name", "old_string", "new_string"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "ui_write",
                "description": UI_WRITE_DESC,
                "parameters": {
                    "type": "object",
                    "properties": {
                        "content": { "type": "string", "description": "Complete .UI XML content. MUST follow Qt .UI file format EXACTLY. Property TYPE tags: text → <string>Hello</string>; bool/enabled → <bool>true</bool>; numbers → <number>42</number>; Qt enums → <set>Qt::EnumName</set> (NEVER <enum>); geometry/rect → <rect><x>0</x><y>0</y><width>100</width><height>30</height></rect> (NEVER comma-separated); sizes → <size><width>100</width><height>30</height></size>; fonts → <font><pointsize>12</pointsize><bold>true</bold></font>; colors → <color><red>255</red><green>0</green><blue>0</blue></color>. FORBIDDEN: align as widget attribute (use alignment set), <enum> tag, Qt enums without Qt:: prefix, comma rect, widget attributes besides class/name, made-up property names. Layout margin properties: leftMargin/topMargin/rightMargin/bottomMargin. Shell: <?xml version=\"1.0\" encoding=\"UTF-8\"?><ui version=\"4.0\">...</ui>. Call ui_read first." }
                    },
                    "required": ["content"]
                }
            }
        }
    ])
}
