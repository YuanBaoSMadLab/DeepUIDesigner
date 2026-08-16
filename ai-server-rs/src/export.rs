// /api/export：先把 .ui 落盘，调 ui2html.exe 转 HTML，再派生 JSX/TSX/Vue 等格式
use axum::Json;
use regex::Regex;
use serde::Deserialize;
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Deserialize)]
pub struct ExportBody {
    content: Option<String>,
    format: Option<String>,
}

pub async fn export(Json(body): Json<ExportBody>) -> (axum::http::StatusCode, Json<Value>) {
    let content = body.content.unwrap_or_default();
    let format = body.format.unwrap_or_default();
    if content.is_empty() || format.is_empty() {
        return (
            axum::http::StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Missing content or format" })),
        );
    }
    match export_ui(&content, &format).await {
        Ok(result) => (
            axum::http::StatusCode::OK,
            Json(json!({ "ok": true, "result": result })),
        ),
        Err(e) => (
            axum::http::StatusCode::BAD_REQUEST,
            Json(json!({ "ok": false, "error": e })),
        ),
    }
}

fn find_ui2html() -> Option<PathBuf> {
    if let Ok(d) = std::env::var("OMNIDER_DIR") {
        let p = PathBuf::from(d).join("ui2html.exe");
        if p.exists() {
            return Some(p);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let p = parent.join("ui2html.exe");
            if p.exists() {
                return Some(p);
            }
        }
    }
    let p = PathBuf::from("ui2html.exe");
    if p.exists() {
        return Some(p);
    }
    None
}

async fn export_ui(content: &str, format: &str) -> Result<String, String> {
    // ui2html.exe 吃文件路径，先写到临时目录
    let tmp_dir = std::env::temp_dir();
    let tmp_ui = tmp_dir.join(format!(
        "export_{}.ui",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    ));
    fs::write(&tmp_ui, content).map_err(|e| format!("{}", e))?;

    let mut html = String::new();
    if ["html", "jsx", "tsx", "vue", "xaml"].contains(&format) {
        if let Some(exe) = find_ui2html() {
            // 10s 超时，别让 ui2html 挂死把请求堵住
            let run = tokio::time::timeout(
                std::time::Duration::from_secs(10),
                tokio::process::Command::new(&exe).arg(&tmp_ui).output(),
            )
            .await;
            if let Ok(Ok(out)) = run {
                if out.status.success() {
                    html = String::from_utf8_lossy(&out.stdout).to_string();
                }
            }
        }
        if html.is_empty() {
            html = fallback_to_html(content);
        }
    }

    let _ = fs::remove_file(&tmp_ui);

    match format {
        "ui" => Ok(content.to_string()),
        "xml" => Ok(format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n{}", content)),
        "html" => Ok(html),
        "jsx" => Ok(html_to_jsx(&html)),
        "tsx" => Ok(html_to_tsx(&html)),
        "vue" => Ok(html_to_vue(&html)),
        "xaml" => Ok(html_to_xaml()),
        other => Err(format!("Unsupported: {}", other)),
    }
}

fn html_to_jsx(html: &str) -> String {
    fallback_jsx(html)
}

fn html_to_tsx(html: &str) -> String {
    let jsx = html_to_jsx(html);
    format!(
        "import React from 'react';\n\nconst App: React.FC = () => {{\n  return (\n    {}\n  );\n}};\n\nexport default App;\n",
        jsx.replace('\n', "\n    ")
    )
}

fn html_to_vue(html: &str) -> String {
    let re_body = Regex::new(r"(?i)<body[^>]*>([\s\S]*?)</body>").unwrap();
    let body = re_body
        .captures(html)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
        .unwrap_or_else(|| html.to_string());
    let re_style = Regex::new(r"(?i)<style[^>]*>([\s\S]*?)</style>").unwrap();
    let style = re_style
        .captures(html)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string());
    let body_trim = body.trim().replace('\n', "\n  ");
    match style {
        Some(s) => format!(
            "<template>\n  {}\n</template>\n\n<script>\nexport default {{\n  name: 'App',\n}};\n</script>\n<style scoped>\n{}\n</style>\n",
            body_trim, s
        ),
        None => format!(
            "<template>\n  {}\n</template>\n\n<script>\nexport default {{\n  name: 'App',\n}};\n</script>\n",
            body_trim
        ),
    }
}

fn html_to_xaml() -> String {
    "<Window xmlns=\"http://schemas.microsoft.com/winfx/2006/xaml/presentation\"\n        Title=\"Preview\" Width=\"800\" Height=\"600\">\n  <Grid>\n  </Grid>\n</Window>\n".to_string()
}

fn fallback_to_html(content: &str) -> String {
    let re_w = Regex::new(r"<width>(\d+)</width>").unwrap();
    let re_h = Regex::new(r"<height>(\d+)</height>").unwrap();
    let re_title = Regex::new(r"<string>([^<]+)</string>").unwrap();
    let w = re_w.captures(content).and_then(|c| c.get(1)).map(|m| m.as_str().to_string()).unwrap_or_else(|| "800".into());
    let h = re_h.captures(content).and_then(|c| c.get(1)).map(|m| m.as_str().to_string()).unwrap_or_else(|| "600".into());
    let title = re_title.captures(content).and_then(|c| c.get(1)).map(|m| m.as_str().to_string()).unwrap_or_else(|| "Preview".into());
    format!(
        "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><title>{}</title></head><body style=\"width:{}px;height:{}px\"></body></html>",
        title, w, h
    )
}

fn fallback_jsx(html: &str) -> String {
    let mut jsx = html.to_string();
    let re_doc = Regex::new(r"(?i)<!DOCTYPE[^>]*>").unwrap();
    let re_html = Regex::new(r"(?i)<html[^>]*>").unwrap();
    let re_html_close = Regex::new(r"(?i)</html>").unwrap();
    let re_head = Regex::new(r"(?i)<head[^>]*>[\s\S]*?</head>").unwrap();
    let re_body = Regex::new(r"(?i)<body[^>]*>").unwrap();
    let re_body_close = Regex::new(r"(?i)</body>").unwrap();
    let re_meta = Regex::new(r"(?i)<meta[^>]*>").unwrap();
    let re_class = Regex::new(r"\bclass=").unwrap();
    let re_link = Regex::new(r"(?i)<link[^>]*>").unwrap();
    let re_script = Regex::new(r"(?i)<script[\s\S]*?</script>").unwrap();
    let re_style_attr = Regex::new(r#"style="([^"]*)""#).unwrap();
    let re_input = Regex::new(r"(?i)<input([^>]*)>").unwrap();
    let re_img = Regex::new(r"(?i)<img([^>]*)>").unwrap();
    let re_br = Regex::new(r"(?i)<br>").unwrap();
    let re_hr = Regex::new(r"(?i)<hr>").unwrap();

    jsx = re_doc.replace_all(&jsx, "").to_string();
    jsx = re_html.replace_all(&jsx, "").to_string();
    jsx = re_html_close.replace_all(&jsx, "").to_string();
    jsx = re_head.replace_all(&jsx, "").to_string();
    jsx = re_body.replace_all(&jsx, "<>").to_string();
    jsx = re_body_close.replace_all(&jsx, "</>").to_string();
    jsx = re_meta.replace_all(&jsx, "").to_string();
    jsx = re_class.replace_all(&jsx, "className=").to_string();
    jsx = re_link.replace_all(&jsx, "").to_string();
    jsx = re_script.replace_all(&jsx, "").to_string();
    jsx = re_style_attr
        .replace_all(&jsx, |caps: &regex::Captures| {
            let s = &caps[1];
            let camel = camelize(s);
            let props: Vec<String> = camel
                .split(';')
                .filter(|p| !p.trim().is_empty())
                .map(|p| {
                    let mut it = p.splitn(2, ':');
                    let k = it.next().unwrap_or("").trim();
                    let v = it.next().unwrap_or("").trim();
                    format!("{}: \"{}\"", k, v)
                })
                .collect();
            format!("style={{{{{}}}}}", props.join(", "))
        })
        .to_string();
    jsx = re_input.replace_all(&jsx, "<input$1 />").to_string();
    jsx = re_img.replace_all(&jsx, "<img$1 />").to_string();
    jsx = re_br.replace_all(&jsx, "<br />").to_string();
    jsx = re_hr.replace_all(&jsx, "<hr />").to_string();

    jsx.trim().to_string()
}

fn camelize(s: &str) -> String {
    // JS 一行 replace 的事，Rust 得手写：-x → X
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '-' {
            if let Some(&n) = chars.peek() {
                if n.is_ascii_lowercase() {
                    out.push(n.to_ascii_uppercase());
                    chars.next();
                    continue;
                }
            }
            out.push('-');
        } else {
            out.push(c);
        }
    }
    out
}
