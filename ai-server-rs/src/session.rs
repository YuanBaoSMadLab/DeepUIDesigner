//! 会话上下文：每个 session 维护分层上下文——system 提示词、项目摘要、
//! 工作层消息、压缩摘要、跨压缩累积的持久摘要、首条任务目标（后两者永不淘汰）。
//! 30 分钟没动静自动清理，防内存无限涨。

use crate::client::ChatMessage;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

/// 会话 30 分钟没活动就清掉
pub const SESSION_TTL_MS: u64 = 30 * 60 * 1000;
/// 后台清理任务的执行间隔
pub const CLEANUP_INTERVAL_MS: u64 = 5 * 60 * 1000;
/// 每隔 N 轮重新注入项目上下文，防止模型记岔了
pub const REINJECT_INTERVAL: u32 = 5;
/// token 软上限，DeepSeek 上下文有 1M，这里留点余量
pub const TOKEN_SOFT_LIMIT: u64 = 800_000;

/// 单个会话的分层上下文
#[derive(Clone)]
pub struct ContextLayer {
    pub system: String,
    pub project_summary: String,
    pub working: Vec<ChatMessage>,
    pub compacted: Option<String>,
    pub persistent_summary: String,
    pub last_summary_turn: u32,
    pub initial_goal: String,
}

impl ContextLayer {
    fn empty() -> Self {
        Self {
            system: String::new(),
            project_summary: String::new(),
            working: Vec::new(),
            compacted: None,
            persistent_summary: String::new(),
            last_summary_turn: 0,
            initial_goal: String::new(),
        }
    }
}

static SESSIONS: OnceLock<Mutex<HashMap<String, ContextLayer>>> = OnceLock::new();
static SESSION_ACTIVE: OnceLock<Mutex<HashMap<String, u64>>> = OnceLock::new();

fn sessions() -> &'static Mutex<HashMap<String, ContextLayer>> {
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn session_active() -> &'static Mutex<HashMap<String, u64>> {
    SESSION_ACTIVE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 粗估 token：中文按 0.6/字、其他 0.3/字，只用来判断超没超上限
pub fn estimate_tokens(text: &str) -> u64 {
    let mut t = 0f64;
    for c in text.chars() {
        t += if ('\u{3400}'..='\u{9fff}').contains(&c) { 0.6 } else { 0.3 };
    }
    t.round() as u64
}

/// 启动后台清理任务（30 分钟未活动清掉）
pub fn spawn_cleanup_task() {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(CLEANUP_INTERVAL_MS)).await;
            let now = now_ms();
            let mut s = sessions().lock().unwrap_or_else(|e| e.into_inner());
            let mut a = session_active().lock().unwrap_or_else(|e| e.into_inner());
            let expired: Vec<String> = a
                .iter()
                .filter(|(_, t)| now.saturating_sub(**t) > SESSION_TTL_MS)
                .map(|(k, _)| k.clone())
                .collect();
            for k in expired {
                s.remove(&k);
                a.remove(&k);
            }
        }
    });
}

/// 取会话上下文副本（顺带刷新活跃时间），没有就建空的
pub fn get_layer(key: &str) -> ContextLayer {
    let mut s = sessions().lock().unwrap_or_else(|e| e.into_inner());
    let mut a = session_active().lock().unwrap_or_else(|e| e.into_inner());
    a.insert(key.to_string(), now_ms());
    if let Some(l) = s.get_mut(key) {
        return l.clone();
    }
    let layer = ContextLayer::empty();
    s.insert(key.to_string(), layer.clone());
    layer
}

/// 写回会话上下文，chat 结束时调用
pub fn update_layer(key: &str, layer: &ContextLayer) {
    let mut s = sessions().lock().unwrap_or_else(|e| e.into_inner());
    s.insert(key.to_string(), layer.clone());
}

/// 清空指定会话
pub fn clear_session(key: &str) {
    let mut s = sessions().lock().unwrap_or_else(|e| e.into_inner());
    let mut a = session_active().lock().unwrap_or_else(|e| e.into_inner());
    s.remove(key);
    a.remove(key);
}

/// 压缩工作层：旧消息换成摘要，只留最近 3 组 user 消息。
/// 关键：旧消息不丢，累积进 persistent_summary 永久保留。
pub fn compact_layer(layer: &mut ContextLayer) {
    let msgs = &layer.working;
    if msgs.len() < 6 {
        return;
    }

    // 留最后 3 个 user 消息开始的对话
    let mut keep_from = msgs.len();
    let mut user_count = 0;
    for i in (0..msgs.len()).rev() {
        if msgs[i].role == "user" {
            user_count += 1;
            if user_count >= 3 {
                keep_from = i;
                break;
            }
        }
    }

    let old: Vec<ChatMessage> = msgs[..keep_from].to_vec();
    let recent: Vec<ChatMessage> = msgs[keep_from..].to_vec();
    if old.is_empty() {
        return;
    }

    // 摘要里带上工具执行结果，光记工具名后面看不懂
    let mut actions: Vec<String> = Vec::new();
    for m in &old {
        if m.role == "user" {
            let s: String = m.content.chars().take(200).collect();
            actions.push(format!("用户要求: {}", s));
        } else if m.role == "assistant" {
            let mut parts: Vec<String> = Vec::new();
            if !m.content.trim().is_empty() {
                let s: String = m.content.chars().take(150).collect();
                parts.push(format!("回复: {}", s));
            }
            if let Some(tcs) = &m.tool_calls {
                if !tcs.is_empty() {
                    let names: Vec<String> = tcs.iter().map(|t| t.function.name.clone()).collect();
                    parts.push(format!("调用工具: {}", names.join(",")));
                }
            }
            if !parts.is_empty() {
                actions.push(parts.join(" | "));
            }
        } else if m.role == "tool" {
            let s: String = m.content.chars().take(120).collect();
            actions.push(format!("结果: {}", s));
        }
    }

    let new_compact = format!("[历史摘要: {}]", actions.join(" → "));

    // 累积进持久层，截到 3000 字符防止无限膨胀
    if !layer.persistent_summary.is_empty() {
        layer.persistent_summary = format!("{}\n{}", layer.persistent_summary, new_compact);
    } else {
        layer.persistent_summary = new_compact.clone();
    }
    if layer.persistent_summary.chars().count() > 3000 {
        let tail: String = layer
            .persistent_summary
            .chars()
            .rev()
            .take(2800)
            .collect::<Vec<_>>()
            .iter()
            .rev()
            .collect();
        layer.persistent_summary = format!("...(earlier)\n{}", tail);
    }

    layer.compacted = Some(new_compact);
    layer.working = recent;
}
