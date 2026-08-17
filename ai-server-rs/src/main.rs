//! 服务入口：组装所有 /api 路由、起 HTTP 服务，顺带托管前端静态文件（src/ui）。
//! 业务逻辑都在各子模块里（chat / apply / ui_state / export ...），这里只负责接线。
mod apply;
mod chat;
mod client;
mod config;
mod export;
mod prompts;
mod session;
mod suggestions;
mod tools;
mod tools_def;
mod ui_state;

use axum::routing::{get, post};
use axum::Json;
use axum::Router;
use serde::Deserialize;
use serde_json::{json, Value};
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_target(false).init();
    config::init_env();
    session::spawn_cleanup_task();

    let ui_dir = config::ui_dir();
    tracing::info!("AI server dir: {}", config::ai_server_dir().display());
    tracing::info!("UI dir: {}", ui_dir.display());

    let app = Router::new()
        .route("/api/settings", get(settings_get).post(settings_post))
        .route("/api/suggestions", get(suggestions::suggestions))
        .route("/api/export", post(export::export))
        .route("/api/ui/state", get(ui_state::get_state))
        .route("/api/ui/update", post(ui_state::update))
        .route("/api/ui/file-content", post(ui_state::file_content))
        .route("/api/chat", post(chat::chat_handler))
        .route("/api/chat/clear", post(chat::clear_handler))
        .route("/api/chat/apply", post(apply::apply))
        .route("/api/chat/revert", post(apply::revert))
        .route("/api/chat/backups", get(apply::backups))
        .route("/api/chat/backup", post(apply::backup))
        .route("/api/chat/delete-backup", post(apply::delete_backup))
        .route("/api/chat/revert-pre", post(apply::revert_pre))
        .route("/api/chat/has-prechat", get(apply::has_prechat))
        .fallback_service(ServeDir::new(&ui_dir))
        .layer(CorsLayer::permissive());

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(9527);
    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap_or_else(|e| {
        tracing::error!("绑定端口 {} 失败: {}", port, e);
        std::process::exit(1);
    });
    tracing::info!("[AI] Omni设计师服务已启动: http://localhost:{}", port);
    axum::serve(listener, app).await.unwrap();
}

async fn settings_get() -> Json<Value> {
    Json(config::settings_from_file())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SettingsBody {
    api_key: Option<String>,
    model: Option<String>,
    base_url: Option<String>,
}

async fn settings_post(Json(body): Json<SettingsBody>) -> Json<Value> {
    config::save_settings(body.api_key, body.model, body.base_url);
    Json(json!({ "ok": true }))
}
