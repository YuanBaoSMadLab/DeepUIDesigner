// 配置：加载 .env、合并环境变量，以及 /api/settings 的读写。
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

#[derive(Clone, Debug)]
pub struct AiConfig {
    pub api_key: String,
    pub base_url: String,
    pub model: String,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            base_url: "https://api.deepseek.com".into(),
            model: "deepseek-v4-flash".into(),
        }
    }
}

/// 合并后的环境（相当于 Node 的 process.env）：外部 env 优先，.env 补缺，settings 写入即时生效
static MERGED: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

/// 服务器工作目录，.env 和 src/ui 都在这下面
pub fn ai_server_dir() -> PathBuf {
    if let Ok(d) = std::env::var("OMNIDER_AI_DIR") {
        let p = PathBuf::from(d);
        if p.join(".env").exists() {
            return p;
        }
    }
    // 再看可执行文件旁边
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let cand = parent.join("../ai-server");
            if cand.join(".env").exists() {
                return cand;
            }
        }
    }
    // 最后看当前工作目录
    if let Ok(cwd) = std::env::current_dir() {
        let cand = cwd.join("ai-server");
        if cand.join(".env").exists() {
            return cand;
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn env_path() -> PathBuf {
    ai_server_dir().join(".env")
}

pub fn ui_dir() -> PathBuf {
    ai_server_dir().join("src/ui")
}

/// 启动时把 .env 合并进环境；外部已有的变量不覆盖
pub fn init_env() {
    let mut merged = HashMap::new();
    if let Ok(raw) = fs::read_to_string(env_path()) {
        for line in raw.split('\n') {
            let t = line.trim();
            if t.is_empty() || t.starts_with('#') {
                continue;
            }
            if let Some(eq) = t.find('=') {
                let key = t[..eq].trim().to_string();
                let value = t[eq + 1..].trim().to_string();
                if key.is_empty() {
                    continue;
                }
                if std::env::var(&key).is_ok() {
                    continue;
                }
                merged.insert(key, value);
            }
        }
    }
    MERGED.set(Mutex::new(merged)).ok();
}

fn get(key: &str) -> Option<String> {
    if let Some(m) = MERGED.get() {
        if let Ok(g) = m.lock() {
            if let Some(v) = g.get(key) {
                return Some(v.clone());
            }
        }
    }
    std::env::var(key).ok()
}

/// 从环境变量拼出 AiConfig（API_KEY 优先，其次 DEEPSEEK_API_KEY）
pub fn load_config() -> AiConfig {
    let mut cfg = AiConfig::default();
    let api_key = get("API_KEY")
        .filter(|s| !s.is_empty())
        .or_else(|| get("DEEPSEEK_API_KEY").filter(|s| !s.is_empty()));
    if let Some(k) = api_key {
        cfg.api_key = k;
    }
    if let Some(b) = get("BASE_URL").filter(|s| !s.is_empty()) {
        cfg.base_url = b;
    }
    if let Some(m) = get("MODEL").filter(|s| !s.is_empty()) {
        cfg.model = m;
    }
    cfg
}

fn extract(raw: &str, key: &str) -> Option<String> {
    // 等价 JS 的 raw.match(key + "=(.+)")，从原文里抠出值
    let re = regex::Regex::new(&format!("{}={}", regex::escape(key), "(.+)")).ok()?;
    re.captures(raw).and_then(|c| c.get(1)).map(|m| m.as_str().trim().to_string())
}

/// GET /api/settings：直接读 .env 原文，不经过内存环境
pub fn settings_from_file() -> serde_json::Value {
    let raw = fs::read_to_string(env_path()).unwrap_or_default();
    serde_json::json!({
        "apiKey": extract(&raw, "API_KEY").unwrap_or_default(),
        "model": extract(&raw, "MODEL").unwrap_or_else(|| "deepseek-v4-flash".into()),
        "baseURL": extract(&raw, "BASE_URL").unwrap_or_else(|| "https://api.deepseek.com".into()),
        "availableModels": [
            { "value": "deepseek-v4-flash", "label": "DeepSeek V4 Flash (推荐)" },
            { "value": "deepseek-v4-pro", "label": "DeepSeek V4 Pro" },
            { "value": "deepseek-chat", "label": "DeepSeek Chat (旧版)" },
            { "value": "deepseek-reasoner", "label": "DeepSeek Reasoner" },
        ],
    })
}

/// POST /api/settings：写 .env 并同步更新内存环境
pub fn save_settings(api_key: Option<String>, model: Option<String>, base_url: Option<String>) {
    let mut lines: Vec<String> = Vec::new();
    if let Some(k) = &api_key {
        lines.push(format!("API_KEY={}", k));
    }
    if let Some(m) = &model {
        lines.push(format!("MODEL={}", m));
    }
    if let Some(b) = &base_url {
        lines.push(format!("BASE_URL={}", b));
    }
    let content = format!("{}\n", lines.join("\n"));
    let _ = fs::write(env_path(), content);

    if let Some(m) = MERGED.get() {
        if let Ok(mut g) = m.lock() {
            if let Some(k) = api_key {
                g.insert("API_KEY".into(), k);
            }
            if let Some(m) = model {
                g.insert("MODEL".into(), m);
            }
            if let Some(b) = base_url {
                g.insert("BASE_URL".into(), b);
            }
        }
    }
}
