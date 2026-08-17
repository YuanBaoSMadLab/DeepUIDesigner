// /api/suggestions：操作建议。有 key 时让 AI 生成，没有就返回内置静态建议
use crate::client;
use crate::config;
use axum::extract::Query;
use axum::Json;
use regex::Regex;
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
pub struct SuggestQuery {
    ui_content: Option<String>,
    selected_count: Option<String>,
    selected_element: Option<String>,
}

pub async fn suggestions(Query(q): Query<SuggestQuery>) -> Json<Value> {
    let ui_content = q.ui_content.unwrap_or_default();
    let selected_count = q
        .selected_count
        .as_deref()
        .and_then(|s| s.parse::<i32>().ok())
        .unwrap_or(0);
    let selected_el = q.selected_element.clone().unwrap_or_default();

    // 没内容时直接给内置建议，不劳烦 AI
    if ui_content.trim().is_empty() {
        return Json(json!([
            { "id": "beautify", "label": "美化界面", "prompt": "请美化当前界面，使用现代化的配色和间距方案" },
            { "id": "layout", "label": "优化布局", "prompt": "请优化当前界面的布局，调整元素间的间距和对齐" },
            { "id": "style", "label": "调整样式", "prompt": "请优化元素样式，包括颜色、字体、边框等视觉效果" },
            { "id": "responsive", "label": "自适应", "prompt": "请调整布局支持窗口缩放，设置合理的sizePolicy" },
        ]));
    }

    let cfg = config::load_config();
    if cfg.api_key.is_empty() {
        let has_selection = selected_count > 0;
        let suggestions = if has_selection {
            json!([
                { "id": "style", "label": "美化选中", "prompt": format!("请美化当前选中的 {} 个控件", selected_count) },
                { "id": "align", "label": "对齐控件", "prompt": "请将选中的控件对齐" },
                { "id": "size", "label": "统一尺寸", "prompt": "请将选中的控件设置为相同尺寸" },
                { "id": "spacing", "label": "调整间距", "prompt": "请调整选中控件之间的间距使其均匀" },
            ])
        } else {
            json!([
                { "id": "beautify", "label": "美化界面", "prompt": "请美化当前界面" },
                { "id": "layout", "label": "优化布局", "prompt": "请优化布局" },
                { "id": "responsive", "label": "自适应", "prompt": "请调整为响应式" },
            ])
        };
        return Json(suggestions);
    }

    // 轻量调一次 AI 生成建议
    let sel_info = if selected_el.is_empty() {
        "用户未选中任何控件".to_string()
    } else {
        let s: String = selected_el.chars().take(300).collect();
        format!("用户选中了: {}", s)
    };
    let ui_snippet: String = ui_content.chars().take(1500).collect();
    let messages = vec![
        json!({ "role": "system", "content": "你是UI设计助手。根据UI文件内容，生成4个简短的操作建议。每个建议包含: label(2-4字)、prompt(简短需求描述)。不要使用emoji。返回纯JSON数组。" }),
        json!({ "role": "user", "content": format!("{}\n文件内容:\n{}\n\n生成4个JSON建议按钮:", sel_info, ui_snippet) }),
    ];
    if let Ok(text) = client::chat_completion(&cfg, &messages).await {
        if let Some(m) = Regex::new(r"\[[\s\S]*\]").unwrap().find(&text) {
            if let Ok(mut arr) = serde_json::from_str::<Vec<Value>>(m.as_str()) {
                arr.truncate(5);
                return Json(Value::Array(arr));
            }
        }
    }

    // 解析失败就给个兜底
    Json(json!([
        { "id": "beautify", "label": "美化", "prompt": "请美化界面" },
        { "id": "layout", "label": "布局", "prompt": "请优化布局" },
    ]))
}
