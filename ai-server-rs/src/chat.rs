//! /api/chat：SSE 流式对话 + 多轮 Agent 循环（调 DeepSeek → 执行工具调用 → 继续，最多 5 轮）。
//! 分层上下文见 session，工具执行见 tools，提示词见 prompts。
//!
//! SSE 事件类型（前端写死，别乱改字段名）：status / text / tool / done / error。

use crate::client::{self, ChatMessage, StreamEvent, ToolCall};
use crate::config;
use crate::prompts::{self, PromptContext};
use crate::session::{self, ContextLayer};
use crate::tools;
use axum::body::Body;
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use bytes::Bytes;
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

/// 单次对话最多跑几轮 Agent（思考 + 工具调用）
const MAX_TURNS: usize = 5;
/// 连续纯文本 N 次就强推它调用工具，防止光聊天不动手
const FORCE_TOOL_AFTER_TEXT_TURNS: usize = 2;
/// 工作层消息上限，超了就把旧的压成摘要
const WORKING_LAYER_MAX: usize = 40;

/// 执行单个工具调用，返回给模型的结果，约定以 OK: / FAIL: 开头
fn execute_tool(tc: &ToolCall, file_path: &str) -> String {
    let args: Value = match serde_json::from_str(&tc.function.arguments) {
        Ok(v) => v,
        Err(_) => {
            return "FAIL: Tool call arguments are invalid JSON (likely truncated by token limit). Use ui_edit for targeted changes instead of ui_write for entire file. Retry with smaller operation.".into()
        }
    };
    let arg = |k: &str| -> String {
        args.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string()
    };
    match tc.function.name.as_str() {
        "ui_read" => tools::read_ui_file(file_path),
        "ui_edit" => {
            let widget = arg("widget_name");
            let old_s = arg("old_string");
            let new_s = arg("new_string");
            tools::create_backup(file_path, "自动备份");
            let (ok, msg, err) = tools::apply_edit(file_path, &widget, &old_s, &new_s);
            if ok {
                format!("OK: {}", msg.unwrap_or_else(|| "modified".into()))
            } else {
                format!("FAIL: {}", err.unwrap_or_else(|| "unknown".into()))
            }
        }
        "ui_write" => {
            let content = arg("content");
            tools::create_backup(file_path, "自动备份");
            let (ok, msg, err) = tools::write_ui_file(file_path, &content);
            if ok {
                format!("OK: {}", msg.unwrap_or_else(|| "file written".into()))
            } else {
                format!("FAIL: {}", err.unwrap_or_else(|| "unknown".into()))
            }
        }
        other => format!("Unknown tool: {}", other),
    }
}

fn sse_str(v: &Value) -> String {
    format!("data: {}\n\n", v)
}

async fn send_event(tx: &mpsc::Sender<SseItem>, v: Value) {
    let _ = tx.send(Ok(Bytes::from(sse_str(&v)))).await;
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatBody {
    message: Option<String>,
    context: Option<ContextBody>,
    session_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextBody {
    ui_file_path: Option<String>,
    ui_content: Option<String>,
    selected_element: Option<String>,
}

type SseItem = Result<Bytes, std::convert::Infallible>;

/// 组装发给模型的 messages：system + 各分层注入 + 工作层 + 当前消息
fn build_messages(
    layer: &mut ContextLayer,
    system_prompt: &str,
    user_prompt: &str,
) -> Vec<ChatMessage> {
    let mut messages: Vec<ChatMessage> = vec![ChatMessage::system(system_prompt)];
    if !layer.initial_goal.is_empty() {
        messages.push(ChatMessage::system(format!("[任务目标] {}", layer.initial_goal)));
    }
    if !layer.persistent_summary.is_empty() {
        messages.push(ChatMessage::system(format!("[操作历史] {}", layer.persistent_summary)));
    }
    if let Some(c) = &layer.compacted {
        messages.push(ChatMessage::system(format!("[最近操作] {}", c)));
    }
    // 每隔几轮重新注入项目上下文，防止模型跑偏
    layer.last_summary_turn += 1;
    if layer.last_summary_turn >= session::REINJECT_INTERVAL {
        layer.last_summary_turn = 0;
        messages.push(ChatMessage::system(format!(
            "Project status: {}",
            layer.project_summary
        )));
    }
    messages.extend(layer.working.clone());
    messages.push(ChatMessage::user(user_prompt));
    messages
}

/// POST /api/chat（SSE 流式）
pub async fn chat_handler(Json(body): Json<ChatBody>) -> Response {
    let message = match body.message {
        Some(m) if !m.trim().is_empty() => m,
        _ => {
            return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Missing message" })))
                .into_response();
        }
    };
    let cfg = config::load_config();
    if cfg.api_key.is_empty() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "No API_KEY" })),
        )
            .into_response();
    }
    let ctx = body.context.unwrap_or(ContextBody {
        ui_file_path: None,
        ui_content: None,
        selected_element: None,
    });
    let file_path = ctx.ui_file_path.clone().unwrap_or_default();
    // 对话前先自动备份，AI 改坏了能一键回到现在
    tools::create_pre_chat_backup(&file_path);
    let key = body.session_id.clone().unwrap_or_else(|| "default".into());
    let start = now_ms();

    let (tx, rx) = mpsc::channel::<SseItem>(64);
    tokio::spawn(async move {
        let pctx = PromptContext {
            ui_file_path: ctx.ui_file_path.clone().unwrap_or_default(),
            ui_content: ctx.ui_content.clone().unwrap_or_default(),
            selected_element: ctx.selected_element.clone(),
        };
        let mut layer = session::get_layer(&key);
        let system_prompt = prompts::build_system_prompt(&pctx);
        let user_prompt = prompts::build_user_message(&message, &pctx);

        layer.system = system_prompt.clone();
        let sel_summary = match &pctx.selected_element {
            Some(s) if !s.is_empty() => prompts::extract_element_name(s),
            _ => "none".to_string(),
        };
        layer.project_summary = if file_path.is_empty() {
            "No file bound.".to_string()
        } else {
            format!("Current file: {}. Selected: {}.", file_path, sel_summary)
        };
        // 首条消息记为任务目标，压缩时永不淘汰
        if layer.initial_goal.is_empty() && !message.trim().is_empty() {
            layer.initial_goal = message.chars().take(300).collect();
        }

        let mut messages = build_messages(&mut layer, &system_prompt, &user_prompt);

        // 超上限就先压一轮再重新组装
        let mut total_tokens: u64 = messages.iter().map(|m| session::estimate_tokens(&m.content)).sum();
        if total_tokens > session::TOKEN_SOFT_LIMIT {
            session::compact_layer(&mut layer);
            messages = build_messages(&mut layer, &system_prompt, &user_prompt);
            total_tokens = messages.iter().map(|m| session::estimate_tokens(&m.content)).sum();
        }

        let mut full_response = String::new();
        let mut text_only_turns = 0;
        let mut turn_messages: Vec<ChatMessage> = Vec::new();

        send_event(
            &tx,
            json!({ "type": "status", "status": "thinking", "ms": now_ms() - start, "tokens": total_tokens }),
        )
        .await;

        'outer: for turn in 0..MAX_TURNS {
            let mut cb = |ev: StreamEvent| match ev {
                StreamEvent::Text(c) => {
                    full_response.push_str(&c);
                    // 用 try_send：阻塞 send 在 tokio 里断了会 panic；客户端跟不上就丢，等于客户端断开
                    let _ = tx.try_send(Ok(Bytes::from(sse_str(&json!({
                        "type": "text",
                        "content": c
                    })))));
                }
                StreamEvent::Done => {}
            };
            let assistant_msg = match client::stream_chat(&cfg, &messages, &mut cb).await {
                Ok(m) => m,
                Err(e) => {
                    let _ = tx
                        .send(Ok(Bytes::from(sse_str(&json!({ "type": "error", "content": e })))))
                        .await;
                    break 'outer;
                }
            };

            messages.push(assistant_msg.clone());
            turn_messages.push(assistant_msg.clone());

            let tool_calls = assistant_msg.tool_calls.clone().unwrap_or_default();
            if tool_calls.is_empty() {
                text_only_turns += 1;
                if text_only_turns >= FORCE_TOOL_AFTER_TEXT_TURNS {
                    messages.push(ChatMessage::user(
                        "MUST call tools to make changes. Call ui_read first, then ui_edit/ui_write.",
                    ));
                    send_event(&tx, json!({ "type": "status", "status": "forcing_tools" })).await;
                    continue;
                }
                break;
            }

            text_only_turns = 0;
            let tool_names: Vec<String> = tool_calls.iter().map(|t| t.function.name.clone()).collect();
            send_event(
                &tx,
                json!({ "type": "status", "status": format!("tools:{}", tool_names.join(",")), "turn": turn }),
            )
            .await;

            for tc in &tool_calls {
                let result = execute_tool(tc, &file_path);
                let ok = result.starts_with("OK:");
                send_event(&tx, json!({ "type": "tool", "name": tc.function.name, "ok": ok })).await;
                let tool_msg = ChatMessage::tool(&tc.id, result);
                messages.push(tool_msg.clone());
                turn_messages.push(tool_msg);
            }
        }

        layer.working.push(ChatMessage::user(message.clone()));
        for m in turn_messages {
            layer.working.push(m);
        }
        while layer.working.len() > WORKING_LAYER_MAX {
            session::compact_layer(&mut layer);
        }
        total_tokens = layer.working.iter().map(|m| session::estimate_tokens(&m.content)).sum();
        let elapsed = now_ms() - start;
        let compacted = layer.compacted.is_some();
        session::update_layer(&key, &layer);
        send_event(
            &tx,
            json!({
                "type": "done",
                "tokens": total_tokens,
                "timeMs": elapsed,
                "workingSize": layer.working.len(),
                "compacted": compacted,
            }),
        )
        .await;
        let _ = full_response;
    });

    let stream = ReceiverStream::new(rx);
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/event-stream")
        .header(header::CACHE_CONTROL, "no-cache")
        .header(header::CONNECTION, "keep-alive")
        .body(Body::from_stream(stream))
        .unwrap()
}

/// POST /api/chat/clear — 清空指定会话
pub async fn clear_handler(Json(body): Json<Value>) -> Json<Value> {
    let key = body
        .get("sessionId")
        .and_then(|v| v.as_str())
        .unwrap_or("default")
        .to_string();
    session::clear_session(&key);
    Json(json!({ "ok": true }))
}
