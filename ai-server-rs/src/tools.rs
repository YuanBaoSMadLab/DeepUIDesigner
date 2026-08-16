// 工具层：.ui 文件的读写、编辑和滚动备份
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

const BACKUP_SUFFIX: &str = ".omniback";
const MAX_BACKUPS: i32 = 5;
const PRECHAT_SUFFIX: &str = ".omniback.prechat";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BackupMeta {
    pub level: i32,
    pub time: String,
    pub label: String,
}

fn meta_path(file_path: &str) -> String {
    format!("{}{}.json", file_path, BACKUP_SUFFIX)
}

fn read_meta(file_path: &str) -> Vec<BackupMeta> {
    let mp = meta_path(file_path);
    if !std::path::Path::new(&mp).exists() {
        return Vec::new();
    }
    fs::read_to_string(&mp)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_meta(file_path: &str, meta: &[BackupMeta]) {
    let _ = fs::write(
        meta_path(file_path),
        serde_json::to_string(meta).unwrap_or_else(|_| "[]".into()),
    );
}

fn now_iso() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // 手搓 ISO 时间，跟 JS 的 toISOString() 对齐（UTC）
    let days = secs / 86400;
    let (y, mo, d, h, mi, s) = civil_from_days(days);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.000Z",
        y, mo, d, h, mi, s
    )
}

fn civil_from_days(z: u64) -> (i64, u64, u64, u64, u64, u64) {
    let secs_of_day = secs_of_day(z);
    let days = z;
    let z = days as i64 + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    let (h, mi, s) = secs_of_day;
    (y, m, d, h, mi, s)
}

fn secs_of_day(z: u64) -> (u64, u64, u64) {
    let s = z % 86400;
    (s / 3600, (s % 3600) / 60, s % 60)
}

pub fn list_backups(file_path: &str) -> Vec<BackupMeta> {
    let all = read_meta(file_path);
    all.into_iter()
        .filter(|b| std::path::Path::new(&format!("{}{}.{}", file_path, BACKUP_SUFFIX, b.level)).exists())
        .collect()
}

pub fn create_backup(file_path: &str, label: &str) -> String {
    let meta = read_meta(file_path);
    // 滚动备份：新的顶上去，最老的删掉
    for i in (0..MAX_BACKUPS).rev() {
        let old_path = format!("{}{}.{}", file_path, BACKUP_SUFFIX, i);
        let new_path = format!("{}{}.{}", file_path, BACKUP_SUFFIX, i + 1);
        if std::path::Path::new(&old_path).exists() {
            if i == MAX_BACKUPS - 1 {
                let _ = fs::remove_file(&old_path);
            } else {
                let _ = fs::rename(&old_path, &new_path);
            }
        }
    }
    let backup_path = format!("{}{}.0", file_path, BACKUP_SUFFIX);
    let _ = fs::copy(file_path, &backup_path);

    let mut new_meta = vec![BackupMeta {
        level: 0,
        time: now_iso(),
        label: label.to_string(),
    }];
    for b in meta {
        let nl = b.level + 1;
        if nl < MAX_BACKUPS {
            new_meta.push(BackupMeta {
                level: nl,
                time: b.time,
                label: b.label,
            });
        }
    }
    write_meta(file_path, &new_meta);
    backup_path
}

pub fn revert_to_backup(file_path: &str, level: i32) -> bool {
    let backup_path = format!("{}{}.{}", file_path, BACKUP_SUFFIX, level);
    if !std::path::Path::new(&backup_path).exists() {
        return false;
    }
    fs::copy(&backup_path, file_path).is_ok()
}

pub fn delete_backup(file_path: &str, level: i32) -> bool {
    let backup_path = format!("{}{}.{}", file_path, BACKUP_SUFFIX, level);
    if !std::path::Path::new(&backup_path).exists() {
        return false;
    }
    let _ = fs::remove_file(&backup_path);

    let mut meta: Vec<BackupMeta> = read_meta(file_path)
        .into_iter()
        .filter(|b| b.level != level)
        .collect();
    meta.sort_by(|a, b| a.level.cmp(&b.level));
    for b in meta.iter_mut() {
        if b.level > level {
            let old_path = format!("{}{}.{}", file_path, BACKUP_SUFFIX, b.level);
            b.level -= 1;
            let new_path = format!("{}{}.{}", file_path, BACKUP_SUFFIX, b.level);
            if std::path::Path::new(&old_path).exists() {
                let _ = fs::rename(&old_path, &new_path);
            }
        }
    }
    write_meta(file_path, &meta);
    true
}

pub fn read_ui_file(file_path: &str) -> String {
    if file_path.is_empty() || !std::path::Path::new(file_path).exists() {
        return String::new();
    }
    fs::read_to_string(file_path).unwrap_or_default()
}

pub fn create_pre_chat_backup(file_path: &str) {
    if file_path.is_empty() || !std::path::Path::new(file_path).exists() {
        return;
    }
    let _ = fs::copy(file_path, format!("{}{}", file_path, PRECHAT_SUFFIX));
}

pub fn revert_to_pre_chat_backup(file_path: &str) -> bool {
    if file_path.is_empty() {
        return false;
    }
    let pre = format!("{}{}", file_path, PRECHAT_SUFFIX);
    if !std::path::Path::new(&pre).exists() {
        return false;
    }
    fs::copy(&pre, file_path).is_ok()
}

pub fn has_pre_chat_backup(file_path: &str) -> bool {
    std::path::Path::new(&format!("{}{}", file_path, PRECHAT_SUFFIX)).exists()
}

/// 校验 .ui XML 的常见错误，格式不对直接拦下
pub fn validate_ui_xml(content: &str) -> Option<String> {
    if Regex::new(r#"<widget[^>]*\salign\s*="#)
        .unwrap()
        .is_match(content)
    {
        return Some("格式错误: 禁止在 <widget> 上使用 align 属性。请使用 <property name=\"alignment\"><set>Qt::AlignCenter</set></property>".into());
    }
    if content.contains("<enum>") {
        return Some("格式错误: 禁止使用 <enum> 标签。枚举值请使用 <set>Qt::EnumName</set>".into());
    }
    let re_set = Regex::new(r#"<set>([^<]+)</set>"#).unwrap();
    for m in re_set.captures_iter(content) {
        let val = m.get(1).map(|g| g.as_str()).unwrap_or("");
        let starts_upper = val.chars().next().map(|c| c.is_ascii_uppercase()).unwrap_or(false);
        if starts_upper
            && !val.starts_with("Qt::")
            && val != "true"
            && val != "false"
            && !val.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false)
        {
            return Some(format!(
                "格式错误: <set> 中的枚举值 \"{}\" 缺少 Qt:: 前缀。请使用 Qt::{}",
                val, val
            ));
        }
    }
    let open_count = Regex::new(r"<\w+").unwrap().find_iter(content).count();
    let close_count = Regex::new(r"</\w+").unwrap().find_iter(content).count();
    if open_count != close_count {
        return Some("格式错误: XML 标签不匹配，可能缺少闭合标签".into());
    }
    if Regex::new(r#"<rect>\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*</rect>"#)
        .unwrap()
        .is_match(content)
    {
        return Some("格式错误: geometry 的 rect 不能使用逗号分隔格式。请使用 <rect><x>0</x><y>0</y><width>100</width><height>30</height></rect>".into());
    }
    None
}

pub fn write_ui_file(file_path: &str, content: &str) -> (bool, Option<String>, Option<String>) {
    if file_path.is_empty() {
        return (false, None, Some("文件路径为空".into()));
    }
    if let Some(err) = validate_ui_xml(content) {
        return (false, None, Some(err));
    }
    match fs::write(file_path, content) {
        Ok(_) => (true, Some("文件已更新".into()), None),
        Err(e) => (false, None, Some(format!("{}", e))),
    }
}

fn escape_regex(s: &str) -> String {
    regex::escape(s).to_string()
}

fn count_occurrences(haystack: &str, needle: &str) -> usize {
    if needle.is_empty() {
        return 0;
    }
    haystack.match_indices(needle).count()
}

fn normalize_xml_text(s: &str) -> String {
    s.split('\n')
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn fuzzy_match(widget_block: &str, old_string: &str) -> Option<String> {
    let old_lines: Vec<&str> = old_string
        .split('\n')
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect();
    if old_lines.is_empty() {
        return None;
    }
    let block_lines: Vec<&str> = widget_block.split('\n').collect();
    for i in 0..=block_lines.len().saturating_sub(old_lines.len()) {
        let mut matched = true;
        for (j, ol) in old_lines.iter().enumerate() {
            if block_lines[i + j].trim() != *ol {
                matched = false;
                break;
            }
        }
        if matched {
            return Some(block_lines[i..i + old_lines.len()].join("\n"));
        }
    }
    None
}

pub fn apply_edit(
    file_path: &str,
    widget_name: &str,
    old_string: &str,
    new_string: &str,
) -> (bool, Option<String>, Option<String>) {
    if file_path.is_empty() || !std::path::Path::new(file_path).exists() {
        return (false, None, Some("文件不存在".into()));
    }
    if old_string.is_empty() {
        return (false, None, Some("old_string 不能为空".into()));
    }
    if old_string == new_string {
        return (false, None, Some("old_string 和 newString 相同".into()));
    }
    let content = match fs::read_to_string(file_path) {
        Ok(c) => c,
        Err(e) => return (false, None, Some(format!("{}", e))),
    };

    // 先按双引号找 name 的 widget，找不到再试单引号
    let name_re = Regex::new(&format!(r#"<widget[^>]*name="{}"[^>]*>"#, escape_regex(widget_name)))
        .unwrap();
    let mut name_match = name_re.find(&content);
    if name_match.is_none() {
        let name_re2 = Regex::new(&format!(
            r#"<widget[^>]*name='{}'[^>]*>"#,
            escape_regex(widget_name)
        ))
        .unwrap();
        name_match = name_re2.find(&content);
    }
    let widget_start = match name_match {
        Some(m) => m.start(),
        None => {
            let mut all_names: Vec<String> = Vec::new();
            let finder = Regex::new(r#"<widget[^>]*name="([^"]*)"[^>]*>"#).unwrap();
            for c in finder.captures_iter(&content) {
                if let Some(n) = c.get(1) {
                    all_names.push(n.as_str().to_string());
                }
            }
            return (
                false,
                None,
                Some(format!(
                    "找不到 name=\"{}\"。文件中控件: [{}]",
                    widget_name,
                    all_names.join(", ")
                )),
            );
        }
    };

    let tag_end = content[widget_start..].find('>').map(|i| widget_start + i).unwrap_or(widget_start);
    let mut widget_end = -1i64;
    if content[tag_end.saturating_sub(1)..].starts_with('/') && tag_end > widget_start {
        // 自闭合
        widget_end = tag_end as i64 + 1;
    } else {
        let widget_re = Regex::new(r#"<widget[^>]*>|</widget>"#).unwrap();
        let mut depth = 0i32;
        for m in widget_re.find_iter(&content) {
            if m.start() < widget_start {
                continue;
            }
            if m.as_str().starts_with("</") {
                depth -= 1;
                if depth == 0 {
                    widget_end = m.end() as i64;
                    break;
                }
            } else {
                depth += 1;
            }
        }
    }

    if widget_end == -1 {
        return (false, None, Some("无法找到 widget 的结束标签".into()));
    }

    let widget_start_us = widget_start;
    let widget_end_us = widget_end as usize;
    let widget_block = &content[widget_start_us..widget_end_us];

    // 按 原文 → 去首尾空白 → 归一化空白 的顺序试，命中唯一的才算
    let strategies: Vec<(&str, String)> = vec![
        ("exact", old_string.to_string()),
        ("trimmed", old_string.trim().to_string()),
        ("normalized", normalize_xml_text(old_string)),
    ];

    let mut best_match: Option<String> = None;
    for (name, m) in strategies {
        let occ = count_occurrences(widget_block, &m);
        if occ == 1 {
            best_match = Some(m);
            break;
        }
        if occ > 1 {
            return (
                false,
                None,
                Some(format!(
                    "old_string 在 {} 内出现了 {} 次（{}匹配），请提供更精确的上下文。",
                    widget_name, occ, name
                )),
            );
        }
    }

    if best_match.is_none() {
        if let Some(fz) = fuzzy_match(widget_block, old_string) {
            best_match = Some(fz);
        } else {
            let preview: String = widget_block.chars().take(500).collect();
            let suffix = if widget_block.chars().count() > 500 { "..." } else { "" };
            return (
                false,
                None,
                Some(format!(
                    "在 {} 内找不到匹配文本。控件内容预览:\n{}{}",
                    widget_name, preview, suffix
                )),
            );
        }
    }

    let bm = best_match.unwrap();
    let new_widget_block = widget_block.replacen(&bm, new_string, 1);
    let new_content = format!(
        "{}{}{}",
        &content[..widget_start_us],
        new_widget_block,
        &content[widget_end_us..]
    );

    // 改完再数一遍 widget/layout 数量，防止替换把结构改坏
    let old_widget_count = Regex::new(r"<widget").unwrap().find_iter(&content).count();
    let new_widget_count = Regex::new(r"<widget").unwrap().find_iter(&new_content).count();
    let old_layout_count = Regex::new(r"<layout").unwrap().find_iter(&content).count();
    let new_layout_count = Regex::new(r"<layout").unwrap().find_iter(&new_content).count();
    if old_widget_count != new_widget_count || old_layout_count != new_layout_count {
        return (
            false,
            None,
            Some(format!(
                "替换破坏了 XML 结构！widget 数量 {}→{}，layout 数量 {}→{}。请确保 old_string 只包含目标控件内部内容，不要包含 widget 标签本身或父级 layout/item 标签。",
                old_widget_count, new_widget_count, old_layout_count, new_layout_count
            )),
        );
    }

    if let Err(e) = fs::write(file_path, &new_content) {
        return (false, None, Some(format!("{}", e)));
    }
    (true, Some(format!("已修改 {} 控件", widget_name)), None)
}
