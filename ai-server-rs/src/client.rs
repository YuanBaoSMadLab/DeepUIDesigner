// DeepSeek 客户端：OpenAI 兼容的 SSE 流式对话 + 非流式单次补全
use crate::config::AiConfig;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ToolFunction {
    pub name: String,
    pub arguments: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub r#type: String,
    pub function: ToolFunction,
}

#[derive(Clone, Debug)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    pub tool_call_id: Option<String>,
    pub tool_calls: Option<Vec<ToolCall>>,
    pub reasoning_content: Option<String>,
}

impl ChatMessage {
    pub fn system(content: impl Into<String>) -> Self {
        Self {
            role: "system".into(),
            content: content.into(),
            tool_call_id: None,
            tool_calls: None,
            reasoning_content: None,
        }
    }
    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: "user".into(),
            content: content.into(),
            tool_call_id: None,
            tool_calls: None,
            reasoning_content: None,
        }
    }
    pub fn tool(tool_call_id: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            role: "tool".into(),
            content: content.into(),
            tool_call_id: Some(tool_call_id.into()),
            tool_calls: None,
            reasoning_content: None,
        }
    }
}

pub enum StreamEvent {
    Text(String),
    Done,
}

/// 工具数量，仅用于打日志；schema 见 tools_def::ui_tools
pub const UI_TOOLS_COUNT: usize = 3;

/// 内部 ChatMessage → OpenAI 请求的 messages 格式
pub fn to_openai_messages(messages: &[ChatMessage]) -> Value {
    let arr: Vec<Value> = messages
        .iter()
        .map(|m| {
            let mut base = json!({ "role": m.role, "content": m.content });
            if let Some(tc) = &m.tool_call_id {
                base["tool_call_id"] = json!(tc);
            }
            if let Some(tcs) = &m.tool_calls {
                base["tool_calls"] = serde_json::to_value(tcs).unwrap_or(Value::Null);
            }
            if m.role == "assistant" {
                base["reasoning_content"] = json!(m.reasoning_content.clone().unwrap_or_default());
            }
            base
        })
        .collect();
    Value::Array(arr)
}

fn reqwest_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        // 连接超时 10s；整体超时不能写这——SSE 长连接要按请求单独设
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("client build error: {}", e))
}

/// 流式对话。on_chunk 是同步回调，收文本和结束信号
pub async fn stream_chat(
    config: &AiConfig,
    messages: &[ChatMessage],
    on_chunk: &mut (dyn FnMut(StreamEvent) + Send),
) -> Result<ChatMessage, String> {
    let url = format!(
        "{}/chat/completions",
        config.base_url.trim_end_matches('/')
    );
    let body = json!({
        "model": config.model,
        "messages": to_openai_messages(messages),
        "tools": crate::tools_def::ui_tools(),
        "tool_choice": "auto",
        "stream": true,
        "stream_options": { "include_usage": true },
        "max_tokens": 32768,
    });

    tracing::info!(
        "[AI] Calling {} @ {} (tools={}, msgs={})",
        config.model,
        config.base_url,
        UI_TOOLS_COUNT,
        messages.len()
    );

    let client = reqwest_client()?;
    let resp = client
        .post(&url)
        .bearer_auth(&config.api_key)
        .json(&body)
        // 流式整体超时 300s——V4 思考 + 工具循环可能拖很久
        .timeout(std::time::Duration::from_secs(300))
        .send()
        .await
        .map_err(|e| format!("API call failed: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp
            .text()
            .await
            .unwrap_or_default();
        let truncated: String = text.chars().take(500).collect();
        return Err(format!(
            "API call failed: HTTP {}, body: {}",
            status, truncated
        ));
    }

    let mut stream = resp.bytes_stream();
    let mut content = String::new();
    let mut reasoning_content = String::new();
    let mut tool_calls_by_index: std::collections::BTreeMap<usize, DeltaToolCall> =
        std::collections::BTreeMap::new();

    let mut buf: Vec<u8> = Vec::new();
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| format!("stream error: {}", e))?;
        buf.extend_from_slice(&bytes);
        // SSE 按行切，一行可能横跨多个网络 chunk
        loop {
            let nl = buf.iter().position(|&b| b == b'\n');
            match nl {
                Some(idx) => {
                    let line: Vec<u8> = buf.drain(..=idx).collect();
                    let line = String::from_utf8_lossy(&line);
                    let line = line.trim();
                    if let Some(data) = line.strip_prefix("data:") {
                        let data = data.trim();
                        if data == "[DONE]" {
                            break;
                        }
                        if let Ok(v) = serde_json::from_str::<Value>(data) {
                            if let Some(choices) = v.get("choices").and_then(|c| c.as_array()) {
                                for choice in choices {
                                    let delta = &choice["delta"];
                                    if delta.is_null() {
                                        continue;
                                    }
                                    if let Some(rc) = delta.get("reasoning_content").and_then(|x| x.as_str()) {
                                        reasoning_content.push_str(rc);
                                    }
                                    if let Some(c) = delta.get("content").and_then(|x| x.as_str()) {
                                        content.push_str(c);
                                        on_chunk(StreamEvent::Text(c.to_string()));
                                    }
                                    if let Some(raw_tcs) = delta.get("tool_calls").and_then(|x| x.as_array()) {
                                        for tc in raw_tcs {
                                            if tc.is_null() || !tc.is_object() {
                                                continue;
                                            }
                                            let index = tc
                                                .get("index")
                                                .and_then(|x| x.as_u64())
                                                .map(|i| i as usize)
                                                .unwrap_or(tool_calls_by_index.len());
                                            let entry = tool_calls_by_index
                                                .entry(index)
                                                .or_insert_with(DeltaToolCall::default);
                                            if let Some(id) = tc.get("id").and_then(|x| x.as_str()) {
                                                entry.id = Some(id.to_string());
                                            }
                                            if let Some(t) = tc.get("type").and_then(|x| x.as_str()) {
                                                entry.r#type = Some(t.to_string());
                                            }
                                            if let Some(func) = tc.get("function") {
                                                if func.is_object() {
                                                    if let Some(n) = func.get("name").and_then(|x| x.as_str()) {
                                                        entry.fname.push_str(n);
                                                    }
                                                    if let Some(a) = func.get("arguments").and_then(|x| x.as_str()) {
                                                        entry.fargs.push_str(a);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                None => break,
            }
        }
    }

    on_chunk(StreamEvent::Done);

    let tool_calls: Vec<ToolCall> = tool_calls_by_index
        .into_iter()
        .map(|(_, tc)| ToolCall {
            id: tc.id.unwrap_or_default(),
            r#type: tc.r#type.unwrap_or_else(|| "function".into()),
            function: ToolFunction {
                name: tc.fname,
                arguments: tc.fargs,
            },
        })
        .collect();

    tracing::info!(
        "[AI] Done: content_len={}, reasoning_len={}, tool_calls={}",
        content.chars().count(),
        reasoning_content.chars().count(),
        tool_calls.len()
    );

    Ok(ChatMessage {
        role: "assistant".into(),
        content,
        tool_call_id: None,
        tool_calls: if tool_calls.is_empty() { None } else { Some(tool_calls) },
        reasoning_content: Some(reasoning_content),
    })
}

#[derive(Default)]
struct DeltaToolCall {
    id: Option<String>,
    r#type: Option<String>,
    fname: String,
    fargs: String,
}

/// 非流式单次补全，/api/suggestions 用
pub async fn chat_completion(
    config: &AiConfig,
    messages: &[Value],
) -> Result<String, String> {
    let url = format!(
        "{}/chat/completions",
        config.base_url.trim_end_matches('/')
    );
    let body = json!({
        "model": config.model,
        "messages": messages,
        "max_tokens": 400,
        "temperature": 0.5,
    });
    let client = reqwest_client()?;
    let resp = client
        .post(&url)
        .bearer_auth(&config.api_key)
        .json(&body)
        // 非流式补全，30s 够用
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("AI调用失败: {}", e))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("AI调用失败: HTTP {}", status));
    }
    let v: Value = resp
        .json()
        .await
        .map_err(|e| format!("解析失败: {}", e))?;
    Ok(v["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string())
}
