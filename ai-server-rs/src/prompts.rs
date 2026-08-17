// 提示词：system prompt、用户消息组装，外加选中元素的摘要提取
use regex::Regex;

pub struct PromptContext {
    pub ui_file_path: String,
    #[allow(dead_code)] // 前端会上报但当前没用上，留着兼容
    pub ui_content: String,
    pub selected_element: Option<String>,
}

impl Default for PromptContext {
    fn default() -> Self {
        Self {
            ui_file_path: String::new(),
            ui_content: String::new(),
            selected_element: None,
        }
    }
}

pub fn build_system_prompt(_ctx: &PromptContext) -> String {
    r#"Qt .UI file editor.

RULES:
1. ALWAYS call ui_read first to see the file contents.
2. When "[Selected: ...]" appears, that is the widget to modify. Use its name as widget_name.
3. ONLY modify the selected widget. Never touch unselected widgets.
4. For ui_edit: copy old_string EXACTLY from ui_read output — preserve ALL whitespace/indentation.
5. LAYOUT PROTECTION: Widgets inside layouts are wrapped in <item> tags. Never modify or remove <layout>, <item>, or sibling widget tags. Only edit content inside the target <widget>...</widget> block.
6. For ui_write: follow the .UI XML format rules in the tool description exactly.
7. Do NOT output XML in chat text — use tools only. Keep replies brief."#
        .to_string()
}

pub fn build_user_message(message: &str, ctx: &PromptContext) -> String {
    let mut parts = vec![message.to_string()];
    if !ctx.ui_file_path.is_empty() {
        parts.push(format!(
            "[File: {}. Use ui_read to see contents.]",
            ctx.ui_file_path
        ));
    }
    if let Some(sel) = &ctx.selected_element {
        if !sel.is_empty() {
            let summary = extract_summary(sel);
            if !summary.is_empty() {
                parts.push(format!("[Selected: {}]", summary));
                parts.push(
                    "[IMPORTANT: Modify ONLY this widget. Use its name as widget_name in ui_edit.]"
                        .to_string(),
                );
            }
        }
    }
    parts.join("\n")
}

fn cap(g: Option<regex::Match>, out: &mut Vec<String>, prefix: &str) {
    if let Some(m) = g {
        let v = m.as_str();
        if !v.is_empty() {
            out.push(format!("{}=\"{}\"", prefix, v));
        }
    }
}

/// 从选中的元素 XML 里抠摘要，拼给模型看
pub fn extract_summary(xml: &str) -> String {
    let re_class = Regex::new(r#"class="([^"]+)""#).unwrap();
    let re_name = Regex::new(r#"name="([^"]+)""#).unwrap();
    let re_rect = Regex::new(r#"<rect>\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\s*</rect>"#).unwrap();
    let re_text = Regex::new(r#"<property name="text">\s*<string>([^<]*)</string>"#).unwrap();
    let re_title = Regex::new(r#"<property name="title">\s*<string>([^<]*)</string>"#).unwrap();
    let re_wt = Regex::new(r#"<property name="windowTitle">\s*<string>([^<]*)</string>"#).unwrap();
    let re_ph = Regex::new(r#"<property name="placeholderText">\s*<string>([^<]*)</string>"#).unwrap();
    let re_tip = Regex::new(r#"<property name="toolTip">\s*<string>([^<]*)</string>"#).unwrap();
    let re_style = Regex::new(r#"<property name="styleSheet">\s*<string>([^<]*)</string>"#).unwrap();

    let mut parts: Vec<String> = Vec::new();
    if let Some(m) = re_class.captures(xml) {
        if let Some(c) = m.get(1) {
            parts.push(format!("class={}", c.as_str()));
        }
    }
    if let Some(m) = re_name.captures(xml) {
        if let Some(n) = m.get(1) {
            if n.as_str().is_empty() {
                parts.push("name=\"\" (unnamed — locate by class and text)".to_string());
            } else {
                parts.push(format!("name=\"{}\"", n.as_str()));
            }
        }
    } else {
        parts.push("name=\"\" (unnamed — locate by class and text)".to_string());
    }

    let mut labels: Vec<String> = Vec::new();
    cap(re_text.captures(xml).and_then(|c| c.get(1)), &mut labels, "text");
    cap(re_title.captures(xml).and_then(|c| c.get(1)), &mut labels, "title");
    cap(re_wt.captures(xml).and_then(|c| c.get(1)), &mut labels, "windowTitle");
    cap(re_ph.captures(xml).and_then(|c| c.get(1)), &mut labels, "placeholder");
    cap(re_tip.captures(xml).and_then(|c| c.get(1)), &mut labels, "tooltip");
    if !labels.is_empty() {
        parts.push(labels.join(" "));
    }

    if let Some(m) = re_rect.captures(xml) {
        let x = m.get(1).map(|g| g.as_str()).unwrap_or("");
        let y = m.get(2).map(|g| g.as_str()).unwrap_or("");
        let w = m.get(3).map(|g| g.as_str()).unwrap_or("");
        let h = m.get(4).map(|g| g.as_str()).unwrap_or("");
        parts.push(format!("rect(x={},y={},w={},h={})", x, y, w, h));
    }

    if let Some(m) = re_style.captures(xml) {
        if let Some(s) = m.get(1) {
            let raw = s.as_str();
            let collapsed: String = raw.split_whitespace().collect::<Vec<_>>().join(" ");
            let truncated: String = collapsed.chars().take(80).collect();
            let suffix = if collapsed.chars().count() > 80 { "..." } else { "" };
            parts.push(format!("style=\"{}{}\"", truncated, suffix));
        }
    }

    parts.join(" | ")
}

pub fn extract_element_name(xml: &str) -> String {
    let re_class = Regex::new(r#"class="([^"]+)""#).unwrap();
    let re_name = Regex::new(r#"name="([^"]+)""#).unwrap();
    let re_text = Regex::new(r#"<property name="text">\s*<string>([^<]*)</string>"#).unwrap();

    let cls = re_class
        .captures(xml)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
        .unwrap_or_else(|| "widget".to_string());
    let name = re_name
        .captures(xml)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
        .unwrap_or_default();
    let text = re_text
        .captures(xml)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
        .unwrap_or_default();

    if !name.is_empty() && !text.is_empty() {
        format!("{} \"{}\" ({})", cls, name, text)
    } else if !name.is_empty() {
        format!("{} \"{}\"", cls, name)
    } else if !text.is_empty() {
        format!("{} ({})", cls, text)
    } else {
        cls
    }
}
