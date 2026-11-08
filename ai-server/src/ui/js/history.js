import { api } from "./api.js";
import { state, addShot } from "./state.js";
import { escapeHtml, openImage } from "./render.js";
import { refreshDesigner } from "./bridge.js";

const $ = (id) => document.getElementById(id);

let notify = () => {};
let onChanged = () => {};
let activeTab = "history";
let drawerOpen = false;

export function initDrawer(options = {}) {
  notify = options.notify || (() => {});
  onChanged = options.onChanged || (() => {});
  $("changesBtn").addEventListener("click", () => openDrawer("history"));
  $("codeBtn").addEventListener("click", () => openDrawer("code"));
  $("shotBtn").addEventListener("click", () => openDrawer("visual"));
  $("layoutBtn").addEventListener("click", () => openDrawer("layout"));
  $("drawerClose").addEventListener("click", closeDrawer);
  $("drawer").addEventListener("click", (e) => {
    if (e.target.id === "drawer") closeDrawer();
  });
  for (const btn of $("drawerTabs").querySelectorAll("button")) {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  }
}

export function openDrawer(tab = "history") {
  drawerOpen = true;
  $("drawer").hidden = false;
  setTab(tab);
}

export function closeDrawer() {
  drawerOpen = false;
  $("drawer").hidden = true;
}

export function isDrawerOpen() {
  return drawerOpen;
}

export function refreshDrawer() {
  if (drawerOpen) renderTab();
}

function setTab(tab) {
  activeTab = tab;
  for (const btn of $("drawerTabs").querySelectorAll("button")) {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  }
  renderTab();
}

async function renderTab() {
  const body = $("drawerBody");
  if (activeTab === "history") await renderHistory(body);
  else if (activeTab === "code") await renderCode(body);
  else if (activeTab === "visual") renderVisual(body);
  else if (activeTab === "layout") await renderLayout(body);
}

async function renderHistory(body) {
  const path = state.uiFilePath;
  if (!path) { body.innerHTML = empty("还没有绑定 .ui 文件"); return; }
  body.innerHTML = `<div class="muted small">加载版本历史...</div>`;
  try {
    const data = await api.history(path);
    const revisions = data.revisions || [];
    body.innerHTML = `
      <div class="drawer-actions">
        <span class="muted small">${escapeHtml(path)} · ${data.file?.lines || 0} 行</span>
        <span class="spacer"></span>
        <button id="snapshotBtn">创建快照</button>
        <button id="revertLastBtn">回退上一版</button>
      </div>
      <div class="rev-list" id="revList"></div>`;

    $("snapshotBtn").addEventListener("click", async () => {
      try {
        await api.snapshot(path, "手动快照");
        notify("已创建快照");
        renderHistory(body);
      } catch (err) { notify(`快照失败：${err.message}`); }
    });
    $("revertLastBtn").addEventListener("click", async () => {
      if (!confirm("回退到上一条修改前？")) return;
      try {
        const r = await api.revertLast(path);
        await afterRevert(r.message || "已回退上一版");
        renderHistory(body);
      } catch (err) { notify(`回退失败：${err.message}`); }
    });

    const list = $("revList");
    if (!revisions.length) {
      list.innerHTML = empty("还没有修改记录。Agent 或手动保存后会生成可回退版本。");
      return;
    }

    for (const rev of revisions) {
      const item = document.createElement("div");
      item.className = "rev-item";
      const sign = rev.added || rev.removed
        ? `<span class="muted small">+${rev.added || 0} / -${rev.removed || 0} 行</span>` : "";
      item.innerHTML = `
        <div class="rev-head">
          <span class="rev-time">${escapeHtml(rev.time.replace("T", " ").slice(0, 19))}</span>
          <span class="rev-tool">${escapeHtml(rev.tool || "edit")}</span>
          ${sign}
        </div>
        <div class="rev-summary">${escapeHtml(rev.summary || rev.widget || "")}</div>
        <div class="rev-actions">
          <button class="diff-btn">查看差异</button>
          <button class="revert-btn danger">回退到此版本</button>
        </div>
        <div class="diff-wrap"></div>`;

      item.querySelector(".diff-btn").addEventListener("click", async () => {
        const wrap = item.querySelector(".diff-wrap");
        if (wrap.dataset.open === "1") { wrap.innerHTML = ""; wrap.dataset.open = "0"; return; }
        try {
          const d = await api.diff(path, rev.id);
          wrap.innerHTML = `<pre class="diff">${diffHtml(d.diff)}</pre>`;
          wrap.dataset.open = "1";
        } catch (err) { notify(`读取差异失败：${err.message}`); }
      });

      item.querySelector(".revert-btn").addEventListener("click", async () => {
        if (!confirm(`回退到 ${rev.id} 修改前？当前内容会被覆盖，但会保留一个回退版本。`)) return;
        try {
          const r = await api.revert(path, rev.id);
          await afterRevert(r.message || "已回退");
          renderHistory(body);
        } catch (err) { notify(`回退失败：${err.message}`); }
      });

      list.appendChild(item);
    }
  } catch (err) {
    body.innerHTML = empty(`读取历史失败：${err.message}`);
  }
}

function diffHtml(diff) {
  return String(diff || "").split("\n").map(line => {
    let cls = "";
    if (line.startsWith("+")) cls = "add";
    else if (line.startsWith("-")) cls = "del";
    else if (line.startsWith("@@")) cls = "hunk";
    return `<span class="${cls}">${escapeHtml(line)}</span>`;
  }).join("\n");
}

async function renderCode(body) {
  const path = state.uiFilePath;
  if (!path) { body.innerHTML = empty("还没有绑定 .ui 文件"); return; }
  body.innerHTML = `<div class="muted small">读取文件...</div>`;
  try {
    const data = await api.file(path);
    body.innerHTML = `
      <div class="drawer-actions">
        <span class="muted small">${escapeHtml(path)}</span>
        <span class="spacer"></span>
        <button id="codeReload">重新加载</button>
        <button id="codeSave" class="primary">保存并生成版本</button>
      </div>
      <textarea id="codeArea" class="code-editor" spellcheck="false"></textarea>
      <div class="muted small" id="codeInfo"></div>`;
    const area = $("codeArea");
    area.value = data.content || "";
    updateInfo();
    area.addEventListener("input", updateInfo);

    $("codeReload").addEventListener("click", async () => {
      if (!confirm("重新加载会丢弃当前未保存的修改，继续？")) return;
      renderCode(body);
    });

    $("codeSave").addEventListener("click", async () => {
      const btn = $("codeSave");
      btn.disabled = true;
      try {
        const r = await api.saveFile(path, area.value);
        notify(r.message || "已保存");
        await refreshDesigner();
        onChanged();
        updateInfo();
      } catch (err) {
        notify(`保存失败：${err.message}`);
      } finally {
        btn.disabled = false;
      }
    });

    function updateInfo() {
      const text = area.value;
      const lines = text.split("\n").length;
      $("codeInfo").textContent = `${lines} 行 · ${new Blob([text]).size} 字节 · 保存前会自动创建可回退版本`;
    }
  } catch (err) {
    body.innerHTML = empty(`读取文件失败：${err.message}`);
  }
}

function renderVisual(body) {
  body.innerHTML = `
    <div class="drawer-actions">
      <span class="muted small">截图来自 designer.exe 窗口，用于检查真实渲染和遮挡。</span>
      <span class="spacer"></span>
      <button id="captureBtn" class="primary">截取当前界面</button>
    </div>
    <div class="shot-grid" id="shotGrid"></div>`;

  $("captureBtn").addEventListener("click", capture);
  renderShots();
}

async function capture() {
  const btn = $("captureBtn");
  if (btn) btn.disabled = true;
  notify("正在截取设计器窗口...");
  try {
    const shot = await api.screenshot();
    addShot(shot, "手动截图");
    renderShots();
    notify("截图完成");
  } catch (err) {
    notify(`截图失败：${err.message}`);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderShots() {
  const grid = $("shotGrid");
  if (!grid) return;
  if (!state.shots.length) {
    grid.innerHTML = empty("还没有截图。运行 Agent 或点击上方按钮截取。");
    return;
  }
  grid.innerHTML = "";
  for (const shot of state.shots) {
    const item = document.createElement("div");
    item.className = "shot-item";
    item.innerHTML = `
      <img src="${shot.url}" alt="界面截图">
      <div class="shot-meta">${escapeHtml(shot.label)} · ${escapeHtml(shot.time.replace("T", " ").slice(11, 19))}</div>`;
    item.querySelector("img").addEventListener("click", () => openImage(shot.url));
    grid.appendChild(item);
  }
}

async function renderLayout(body) {
  const path = state.uiFilePath;
  if (!path) { body.innerHTML = empty("还没有绑定 .ui 文件"); return; }
  body.innerHTML = `<div class="muted small">检查布局...</div>`;
  try {
    const data = await api.layout(path);
    const issues = data.issues || [];
    body.innerHTML = `
      <div class="drawer-actions">
        <span class="muted small">${issues.length ? `发现 ${issues.length} 个问题` : "没有发现问题"}</span>
        <span class="spacer"></span>
        <button id="layoutReload">重新检查</button>
      </div>
      <div class="issue-list" id="issueList"></div>
      <details style="margin-top:12px">
        <summary class="muted small">查看控件树</summary>
        <pre class="diff" style="margin-top:8px">${escapeHtml(data.tree || "")}</pre>
      </details>`;

    $("layoutReload").addEventListener("click", () => renderLayout(body));
    const list = $("issueList");
    if (!issues.length) {
      list.innerHTML = empty("没有发现重叠、遮挡、越界或零尺寸问题。");
      return;
    }
    for (const issue of issues) {
      const el = document.createElement("div");
      el.className = `issue ${issue.severity}`;
      el.innerHTML = `
        <div><strong>${escapeHtml(issue.widget)}</strong>
        ${issue.other ? ` <span class="muted">↔ ${escapeHtml(issue.other)}</span>` : ""}
        <span class="muted small"> ${escapeHtml(issue.code)}</span></div>
        <div>${escapeHtml(issue.message)}</div>
        ${issue.rect ? `<div class="muted small">区域 ${issue.rect.x},${issue.rect.y} ${issue.rect.w}x${issue.rect.h}</div>` : ""}`;
      list.appendChild(el);
    }
  } catch (err) {
    body.innerHTML = empty(`检查失败：${err.message}`);
  }
}

async function afterRevert(message) {
  notify(message);
  await refreshDesigner();
  onChanged();
}

function empty(text) {
  return `<div class="muted small" style="padding:24px 4px;text-align:center">${escapeHtml(text)}</div>`;
}
