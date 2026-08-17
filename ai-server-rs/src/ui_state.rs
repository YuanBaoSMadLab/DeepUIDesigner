// /api/ui：前端把当前文件路径、选中元素、对象树同步到后端内存
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};
use std::fs;
use std::sync::{Mutex, OnceLock};

static STATE: OnceLock<Mutex<Value>> = OnceLock::new();

fn state() -> &'static Mutex<Value> {
    STATE.get_or_init(|| {
        Mutex::new(json!({
            "uiFilePath": "",
            "uiContent": "",
            "selectedElement": null,
            "objectTree": null,
        }))
    })
}

/// 锁中毒防御：就算别的线程 panic 也得把锁拿回来，不能让服务崩
fn lock_state() -> std::sync::MutexGuard<'static, Value> {
    state().lock().unwrap_or_else(|e| e.into_inner())
}

fn refresh_content(s: &mut Value) {
    if let Some(p) = s.get("uiFilePath").and_then(|v| v.as_str()) {
        if !p.is_empty() && fs::metadata(p).map(|m| m.is_file()).unwrap_or(false) {
            if let Ok(c) = fs::read_to_string(p) {
                s["uiContent"] = json!(c);
            }
        }
    }
}

pub async fn get_state() -> Json<Value> {
    let mut g = lock_state();
    refresh_content(&mut g);
    Json(g.clone())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBody {
    ui_file_path: Option<String>,
    selected_element: Option<Value>,
    object_tree: Option<Value>,
}

pub async fn update(Json(body): Json<UpdateBody>) -> Json<Value> {
    let mut g = lock_state();
    if let Some(p) = body.ui_file_path {
        g["uiFilePath"] = json!(p);
        refresh_content(&mut g);
    }
    if let Some(se) = body.selected_element {
        g["selectedElement"] = se;
    }
    if let Some(ot) = body.object_tree {
        g["objectTree"] = ot;
    }
    Json(json!({ "ok": true }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContentBody {
    file_path: Option<String>,
}

pub async fn file_content(
    Json(body): Json<FileContentBody>,
) -> (axum::http::StatusCode, Json<Value>) {
    let fp = body.file_path.unwrap_or_default();
    if fp.is_empty() || !fs::metadata(&fp).map(|m| m.is_file()).unwrap_or(false) {
        return (
            axum::http::StatusCode::NOT_FOUND,
            Json(json!({ "error": "文件不存在" })),
        );
    }
    match fs::read_to_string(&fp) {
        Ok(c) => (axum::http::StatusCode::OK, Json(json!({ "content": c }))),
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("{}", e) })),
        ),
    }
}
