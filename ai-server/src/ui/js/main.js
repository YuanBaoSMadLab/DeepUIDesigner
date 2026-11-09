import { api, streamAgent } from "./api.js";
import { initBridge, refreshDesigner } from "./bridge.js";
import { state, basename, setSelection } from "./state.js";
import { Timeline, escapeHtml } from "./render.js";
import { initSettings, openSettings, updateModelPill, refreshSettingsSummary } from "./settings.js";
import { initDrawer, openDrawer, refreshDrawer } from "./history.js";

const $ = (id) => document.getElementById(id);
const timeline = new Timeline($("timeline"), {
  onDone: handleRunDone,
  onRevertRun: handleRevertRun,
  onOpenHistory: () => openDrawer("history"),
  onShot: () => refreshDrawer(),
});

let toastTimer = null;
let syncTimer = null;
let lastSyncKey = "";
let health = null;
let setupOpened = false;
let pendingAttachments = [];

function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

async function addFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  for (const file of files) {
    if (pendingAttachments.length >= 6) { notify("最多同时附加 6 个文件"); break; }
    try {
      const dataUrl = await readDataUrl(file);
      const r = await api.upload({ name: file.name, type: file.type, dataUrl });
      if (r?.attachment) pendingAttachments.push(r.attachment);
    } catch (err) {
      notify(`上传失败：${err.message || file.name}`);
    }
  }
  renderAttachments();
}

function renderAttachments() {
  const bar = $("attachBar");
  bar.innerHTML = "";
  if (!pendingAttachments.length) { bar.hidden = true; return; }
  bar.hidden = false;
  pendingAttachments.forEach((a, i) => {
    const chip = document.createElement("div");
    chip.className = "attach-chip";
    if (a.kind === "image") {
      const img = document.createElement("img");
      img.src = a.dataUrl;
      img.alt = a.name;
      chip.appendChild(img);
    }
    const name = document.createElement("span");
    name.className = "attach-name";
    name.textContent = a.name;
    chip.appendChild(name);
    const del = document.createElement("button");
    del.className = "attach-del";
    del.textContent = "×";
    del.title = "移除";
    del.addEventListener("click", () => {
      pendingAttachments.splice(i, 1);
      renderAttachments();
    });
    chip.appendChild(del);
    bar.appendChild(chip);
  });
}

function init() {
  initTheme();
  initDrawer({ notify, onChanged: handleFileChanged });
  initSettings({
    notify,
    onSaved: () => {
      updateModelPill();
      checkHealth();
    },
  });
  initBridge(applyUiState);
  window.updateUiState = applyUiState;

  $("sendBtn").addEventListener("click", send);
  $("stopBtn").addEventListener("click", stop);
  $("clearBtn").addEventListener("click", clearChat);
  $("attachToggle").addEventListener("change", () => {
    state.attached = $("attachToggle").checked;
    renderSelection();
  });
  $("noticeAction").addEventListener("click", openSettings);
  $("themeBtn").addEventListener("click", toggleTheme);
  $("imageBtn").addEventListener("click", () => $("imageInput").click());
  $("docBtn").addEventListener("click", () => $("docInput").click());
  $("imageInput").addEventListener("change", (e) => addFiles(e.target.files));
  $("docInput").addEventListener("change", (e) => addFiles(e.target.files));
  $("userInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });

  checkHealth();
  refreshSettingsSummary().then(() => updateModelPill());
  loadServerState();
  setInterval(checkHealth, 15000);
}

async function loadServerState() {
  try {
    const s = await api.getUiState();
    if (s.uiFilePath && !state.uiFilePath) {
      applyUiState({ uiFilePath: s.uiFilePath, selectedElement: s.selectedElement }, false);
    }
  } catch { /* ignore */ }
}

function applyUiState(data, sync = true) {
  if (!data) return;
  if (typeof data.uiFilePath === "string") state.uiFilePath = data.uiFilePath;
  if (typeof data.uiFileContent === "string") state.uiContent = data.uiFileContent;
  if (data.selectedElement !== undefined) setSelection(data.selectedElement);
  renderFile();
  renderSelection();
  if (sync) scheduleSync();
}

function renderFile() {
  const label = state.uiFilePath ? basename(state.uiFilePath) : "未绑定文件";
  $("fileLabel").textContent = label;
  $("fileLabel").title = state.uiFilePath || "";
  $("connDot").className = `dot ${state.uiFilePath ? "online" : ""}`;
}

function renderSelection() {
  const bar = $("selectionBar");
  const sel = state.selection;
  if (!sel) { bar.hidden = true; return; }
  bar.hidden = false;
  const chip = $("selectionChip");
  chip.innerHTML = sel.count > 1
    ? `<span>${escapeHtml(sel.label)}</span>`
    : `<span>@${escapeHtml(sel.name || sel.label)}</span><span class="chip-class">${escapeHtml(sel.className)}</span>`;
  $("selectionHint").textContent = state.attached
    ? "会随下一条消息发送给 Agent"
    : "未附带，可在工具栏开关";
  $("selLabel").textContent = sel.label;
}

function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    const key = `${state.uiFilePath}|${state.selectedElement || ""}|${state.uiContent.length}`;
    if (key === lastSyncKey) return;
    lastSyncKey = key;
    try {
      await api.updateUiState({
        uiFilePath: state.uiFilePath,
        selectedElement: state.selectedElement,
      });
    } catch { /* 服务端状态是辅助信息 */ }
  }, 250);
}

async function checkHealth() {
  try {
    health = await api.health();
    state.connected = true;
    const notice = $("notice");
    if (!health.hasKey) {
      $("noticeText").textContent = "尚未配置 API 密钥，填写后即可使用 Agent。";
      $("noticeAction").textContent = "填写密钥";
      notice.hidden = false;
      if (!setupOpened && !state.running) {
        setupOpened = true;
        setTimeout(() => { if ($("settingsModal").hidden) openSettings(); }, 600);
      }
    } else if (!health.model) {
      $("noticeText").textContent = "尚未选择模型。";
      notice.hidden = false;
    } else {
      notice.hidden = true;
    }
    if (!state.running) {
      $("connDot").className = `dot ${health.hasKey ? "online" : "error"}`;
    }
  } catch {
    state.connected = false;
    $("connDot").className = "dot error";
    $("noticeText").textContent = "AI 服务未连接，请确认 ai-server 已启动。";
    $("notice").hidden = false;
  }
}

async function send() {
  if (state.running) return;
  const input = $("userInput");
  const text = input.value.trim();
  if (!text && !pendingAttachments.length) return;
  if (health && !health.hasKey) {
    notify("请先在设置中填写 API 密钥");
    openSettings();
    return;
  }

  const attached = state.attached && !!state.selectedElement;
  const selectionText = attached
    ? (state.selection?.count > 1 ? state.selection.label : `@${state.selection?.name || ""} · ${state.selection?.className || ""}`)
    : "";

  const files = pendingAttachments.slice();
  timeline.addUser(text || "（仅附件）", selectionText, files);
  input.value = "";
  pendingAttachments = [];
  renderAttachments();
  setRunning(true);

  const controller = new AbortController();
  state.abort = controller;

  try {
    await streamAgent({
      message: text || "请查看我附加的图片或文档，并根据内容协助我。",
      sessionId: state.sessionId,
      attachSelection: attached,
      attachments: files,
      context: {
        uiFilePath: state.uiFilePath,
        selectedElement: attached ? state.selectedElement : null,
      },
    }, (event) => {
      if (event.type === "phase") {
        setStatus(event.status === "start"
          ? `${event.label}${event.detail ? ` · ${event.detail}` : ""}...`
          : event.status === "error" ? `${event.label}失败` : `${event.label}完成`,
        event.status === "error" ? "error" : "busy");
      } else if (event.type === "tool_start") {
        setStatus(`正在${event.label}...`, "busy");
      } else if (event.type === "done") {
        setStatus(`完成 · ${(event.timeMs / 1000).toFixed(1)}s`, event.changed ? "busy" : "");
      } else if (event.type === "error") {
        setStatus("运行失败", "error");
      }
      timeline.handle(event);
      if (event.type === "done" || event.type === "error") setRunning(false);
    }, controller.signal);
  } catch (err) {
    if (err.name === "AbortError") {
      timeline.addSystem("已停止");
    } else {
      timeline.addError(err.message || String(err));
    }
    setRunning(false);
    setStatus("出错", "error");
  } finally {
    state.abort = null;
    if (state.running) setRunning(false);
  }
}

function stop() {
  if (state.abort) state.abort.abort();
}

function setRunning(running) {
  state.running = running;
  $("sendBtn").disabled = running;
  $("stopBtn").hidden = !running;
  $("userInput").disabled = running;
  if (!running) {
    $("runStatus").textContent = $("runStatus").textContent || "就绪";
    if ($("runStatus").classList.contains("busy") && !$("runStatus").textContent.startsWith("完成")) {
      setStatus("就绪", "");
    }
    checkHealth();
  }
}

function setStatus(text, kind = "") {
  const el = $("runStatus");
  el.textContent = text;
  el.className = `run-status ${kind}`;
}

async function handleRunDone(event) {
  if (event.changed) {
    setTimeout(async () => {
      const r = await refreshDesigner();
      if (!r.ok) notify(`界面刷新失败：${r.error || r.text || "请手动刷新"}`);
      handleFileChanged();
      try {
        const s = await api.getUiState();
        if (s.uiFilePath) applyUiState({ uiFilePath: s.uiFilePath, selectedElement: s.selectedElement });
      } catch { /* ignore */ }
    }, 120);
  }
  setStatus(event.changed ? `完成 · 已修改 · ${(event.timeMs / 1000).toFixed(1)}s` : `完成 · ${(event.timeMs / 1000).toFixed(1)}s`, "");
}

async function handleRevertRun(runId) {
  if (!state.uiFilePath) { notify("没有绑定文件"); return; }
  if (!confirm("恢复到本次 Agent 运行前的文件内容？")) return;
  try {
    const r = await api.revertSession(state.uiFilePath, runId);
    if (!r.ok) { notify(r.error || "回退失败"); return; }
    notify(r.message || "已恢复");
    await refreshDesigner();
    handleFileChanged();
    openDrawer("history");
  } catch (err) {
    notify(`回退失败：${err.message}`);
  }
}

function handleFileChanged() {
  if (refreshDrawer) refreshDrawer();
  try {
    api.getUiState().then(s => {
      if (s.uiFilePath) applyUiState({ uiFilePath: s.uiFilePath, selectedElement: s.selectedElement });
    }).catch(() => {});
  } catch { /* ignore */ }
}

async function clearChat() {
  timeline.clear();
  pendingAttachments = [];
  renderAttachments();
  try { await api.clear(state.sessionId); } catch { /* ignore */ }
  setStatus("就绪", "");
}

function notify(text) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

const THEME_KEY = "omni-theme-v2";
const THEME_ORDER = ["auto", "dark", "light"];
const themeMedia = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
let themeMode = localStorage.getItem(THEME_KEY) || "auto";

function effectiveTheme() {
  if (themeMode === "auto") return themeMedia?.matches ? "dark" : "light";
  return themeMode;
}

function applyTheme() {
  document.documentElement.dataset.theme = effectiveTheme();
  const btn = $("themeBtn");
  btn.textContent = themeMode === "auto" ? "主题·自动" : themeMode === "dark" ? "主题·深色" : "主题·浅色";
  btn.title = "自动跟随系统 / 深色 / 浅色（点击切换）";
}

function initTheme() {
  if (!THEME_ORDER.includes(themeMode)) themeMode = "auto";
  applyTheme();
  themeMedia?.addEventListener?.("change", () => {
    if (themeMode === "auto") applyTheme();
  });
}

function toggleTheme() {
  themeMode = THEME_ORDER[(THEME_ORDER.indexOf(themeMode) + 1) % THEME_ORDER.length];
  localStorage.setItem(THEME_KEY, themeMode);
  applyTheme();
}

init();
