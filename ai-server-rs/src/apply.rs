// /api/chat/* 的备份/回退/写入路由，全落到 tools 模块操作
use crate::tools;
use axum::extract::Query;
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};
use std::fs;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyBody {
    ui_file_path: Option<String>,
    content: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevertBody {
    ui_file_path: Option<String>,
    level: Option<i32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupBody {
    ui_file_path: Option<String>,
    label: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LevelBody {
    ui_file_path: Option<String>,
    level: i32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathOnly {
    ui_file_path: Option<String>,
}

#[derive(Deserialize)]
pub struct PathQuery {
    path: Option<String>,
}

pub async fn apply(Json(body): Json<ApplyBody>) -> (axum::http::StatusCode, Json<Value>) {
    let ui_file_path = match body.ui_file_path {
        Some(p) if !p.is_empty() => p,
        _ => {
            return (
                axum::http::StatusCode::BAD_REQUEST,
                Json(json!({ "error": "缺少 uiFilePath" })),
            )
        }
    };
    if !fs::metadata(&ui_file_path).map(|m| m.is_file()).unwrap_or(false) {
        return (
            axum::http::StatusCode::NOT_FOUND,
            Json(json!({ "error": "UI 文件不存在，请先保存" })),
        );
    }
    if let Some(content) = body.content {
        if !content.is_empty() {
            tools::create_backup(&ui_file_path, "自动备份");
            let (ok, _msg, err) = tools::write_ui_file(&ui_file_path, &content);
            if ok {
                return (
                    axum::http::StatusCode::OK,
                    Json(json!({ "ok": true, "message": "修改已应用" })),
                );
            } else {
                return (
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "ok": false, "error": err.unwrap_or_default() })),
                );
            }
        }
    }
    (
        axum::http::StatusCode::OK,
        Json(json!({ "ok": true, "message": "文件可用" })),
    )
}

pub async fn revert(Json(body): Json<RevertBody>) -> (axum::http::StatusCode, Json<Value>) {
    let ui_file_path = match body.ui_file_path {
        Some(p) if !p.is_empty() => p,
        _ => {
            return (
                axum::http::StatusCode::BAD_REQUEST,
                Json(json!({ "error": "缺少 uiFilePath" })),
            )
        }
    };
    if !fs::metadata(&ui_file_path).map(|m| m.is_file()).unwrap_or(false) {
        return (
            axum::http::StatusCode::NOT_FOUND,
            Json(json!({ "error": "UI 文件不存在" })),
        );
    }
    let lv = body.level.unwrap_or(0);
    if tools::revert_to_backup(&ui_file_path, lv) {
        let msg = if lv == 0 {
            "已回退到上一版本".to_string()
        } else {
            format!("已回退到第 {} 个备份", lv)
        };
        (
            axum::http::StatusCode::OK,
            Json(json!({ "ok": true, "message": msg })),
        )
    } else {
        (
            axum::http::StatusCode::NOT_FOUND,
            Json(json!({ "ok": false, "error": format!("备份 {} 不可用", lv) })),
        )
    }
}

pub async fn backups(Query(q): Query<PathQuery>) -> Json<Value> {
    let path = q.path.unwrap_or_default();
    if path.is_empty() || !fs::metadata(&path).map(|m| m.is_file()).unwrap_or(false) {
        return Json(json!({ "backups": [] }));
    }
    Json(json!({ "backups": tools::list_backups(&path) }))
}

pub async fn backup(Json(body): Json<BackupBody>) -> (axum::http::StatusCode, Json<Value>) {
    let ui_file_path = match body.ui_file_path {
        Some(p) if !p.is_empty() => p,
        _ => {
            return (
                axum::http::StatusCode::NOT_FOUND,
                Json(json!({ "error": "UI 文件不存在" })),
            )
        }
    };
    if !fs::metadata(&ui_file_path).map(|m| m.is_file()).unwrap_or(false) {
        return (
            axum::http::StatusCode::NOT_FOUND,
            Json(json!({ "error": "UI 文件不存在" })),
        );
    }
    let label = body.label.unwrap_or_else(|| "手动备份".to_string());
    let backup_path = tools::create_backup(&ui_file_path, &label);
    (
        axum::http::StatusCode::OK,
        Json(json!({ "ok": true, "backupPath": backup_path })),
    )
}

pub async fn delete_backup(Json(body): Json<LevelBody>) -> (axum::http::StatusCode, Json<Value>) {
    let ui_file_path = match body.ui_file_path {
        Some(p) if !p.is_empty() => p,
        _ => {
            return (
                axum::http::StatusCode::BAD_REQUEST,
                Json(json!({ "error": "缺少 uiFilePath" })),
            )
        }
    };
    if tools::delete_backup(&ui_file_path, body.level) {
        (
            axum::http::StatusCode::OK,
            Json(json!({ "ok": true, "message": format!("已删除备份 #{}", body.level) })),
        )
    } else {
        (
            axum::http::StatusCode::NOT_FOUND,
            Json(json!({ "ok": false, "error": format!("备份 #{} 不存在", body.level) })),
        )
    }
}

pub async fn revert_pre(Json(body): Json<PathOnly>) -> (axum::http::StatusCode, Json<Value>) {
    let ui_file_path = match body.ui_file_path {
        Some(p) if !p.is_empty() => p,
        _ => {
            return (
                axum::http::StatusCode::NOT_FOUND,
                Json(json!({ "error": "UI 文件不存在" })),
            )
        }
    };
    if !fs::metadata(&ui_file_path).map(|m| m.is_file()).unwrap_or(false) {
        return (
            axum::http::StatusCode::NOT_FOUND,
            Json(json!({ "error": "UI 文件不存在" })),
        );
    }
    if tools::revert_to_pre_chat_backup(&ui_file_path) {
        (
            axum::http::StatusCode::OK,
            Json(json!({ "ok": true, "message": "已恢复到提问前状态" })),
        )
    } else {
        (
            axum::http::StatusCode::NOT_FOUND,
            Json(json!({ "ok": false, "error": "没有提问前的备份" })),
        )
    }
}

pub async fn has_prechat(Query(q): Query<PathQuery>) -> Json<Value> {
    Json(json!({ "exists": tools::has_pre_chat_backup(&q.path.unwrap_or_default()) }))
}
