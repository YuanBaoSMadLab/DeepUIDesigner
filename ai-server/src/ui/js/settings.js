import { api } from "./api.js";
import { state } from "./state.js";

let cfg = null;
let editingId = "";
let isNew = false;
let notify = () => {};
let onSaved = () => {};

const $ = (id) => document.getElementById(id);

export function initSettings(options = {}) {
  notify = options.notify || (() => {});
  onSaved = options.onSaved || (() => {});
  $("settingsBtn").addEventListener("click", openSettings);
  $("settingsClose").addEventListener("click", closeSettings);
  $("modelPill").addEventListener("click", openSettings);
  $("settingsModal").addEventListener("click", (e) => {
    if (e.target.id === "settingsModal") closeSettings();
  });
  $("providerSelect").addEventListener("change", onProviderChange);
  $("providerAdd").addEventListener("click", addProvider);
  $("providerDelete").addEventListener("click", deleteProvider);
  $("fetchModelsBtn").addEventListener("click", fetchModels);
  $("testBtn").addEventListener("click", testConnection);
  $("settingsSave").addEventListener("click", save);
}

export async function openSettings() {
  try {
    cfg = await api.settings();
    state.settings = cfg;
    state.providers = cfg.providers || [];
    isNew = false;
    editingId = cfg.activeProvider;
    renderProviders();
    fillProvider(cfg.providers.find(p => p.id === editingId) || cfg.providers[0]);
    $("modelInput").value = cfg.activeModel || "";
    $("temperature").value = cfg.agent?.temperature ?? 0.3;
    $("maxTokens").value = cfg.agent?.maxTokens ?? 4096;
    $("maxSteps").value = cfg.agent?.maxSteps ?? 16;
    $("showReasoning").checked = cfg.agent?.showReasoning !== false;
    $("settingsStatus").textContent = "";
    $("settingsModal").hidden = false;
  } catch (err) {
    notify(`读取设置失败：${err.message}`);
  }
}

export function closeSettings() {
  $("settingsModal").hidden = true;
}

function renderProviders() {
  const sel = $("providerSelect");
  sel.innerHTML = "";
  for (const p of state.providers) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name || p.id;
    sel.appendChild(opt);
  }
  if (isNew) {
    const opt = document.createElement("option");
    opt.value = "__new__";
    opt.textContent = "新服务商";
    sel.appendChild(opt);
    sel.value = "__new__";
  } else {
    sel.value = editingId;
  }
}

function onProviderChange() {
  const id = $("providerSelect").value;
  if (id === "__new__") {
    isNew = true;
    editingId = "";
    clearForm();
    return;
  }
  isNew = false;
  editingId = id;
  const p = state.providers.find(x => x.id === id);
  if (p) {
    fillProvider(p);
    $("modelInput").value = cfg?.activeModel && cfg.activeProvider === id ? cfg.activeModel : (p.models[0] || "");
  }
}

function fillProvider(p) {
  if (!p) return;
  $("providerName").value = p.name || "";
  $("providerBase").value = p.baseURL || "";
  $("providerKey").value = p.apiKey || "";
  $("visionModel").value = p.visionModel || "";
  $("supportsVision").checked = !!p.supportsVision;
  fillModels(p.models || []);
}

function clearForm() {
  $("providerName").value = "";
  $("providerBase").value = "";
  $("providerKey").value = "";
  $("visionModel").value = "";
  $("supportsVision").checked = false;
  $("modelInput").value = "";
  fillModels([]);
}

function fillModels(models) {
  const dl = $("modelList");
  dl.innerHTML = "";
  for (const m of Array.from(new Set(models.filter(Boolean)))) {
    const opt = document.createElement("option");
    opt.value = m;
    dl.appendChild(opt);
  }
}

function addProvider() {
  isNew = true;
  editingId = "";
  renderProviders();
  clearForm();
  $("providerName").focus();
}

async function deleteProvider() {
  if (!editingId) { notify("当前是新服务商，无需删除"); return; }
  if (!confirm(`删除服务商「${$("providerName").value || editingId}」？`)) return;
  try {
    await api.deleteProvider(editingId);
    notify("已删除服务商");
    await openSettings();
  } catch (err) {
    notify(`删除失败：${err.message}`);
  }
}

async function fetchModels() {
  const btn = $("fetchModelsBtn");
  btn.disabled = true;
  $("settingsStatus").textContent = "正在拉取模型列表...";
  try {
    const result = await api.testProvider({
      baseURL: $("providerBase").value.trim(),
      apiKey: $("providerKey").value.trim(),
      name: $("providerName").value.trim(),
    });
    if (result.ok) {
      fillModels([...(result.models || []), ...currentModels()]);
      $("settingsStatus").textContent = `连接正常，发现 ${result.models?.length || 0} 个模型。`;
    } else {
      fillModels(currentModels());
      $("settingsStatus").textContent = `拉取失败：${result.error || "接口不支持 /models"}。仍可手动填写模型名。`;
    }
  } catch (err) {
    $("settingsStatus").textContent = `拉取失败：${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

function currentModels() {
  const p = state.providers.find(x => x.id === editingId);
  return p?.models || [];
}

async function testConnection() {
  const btn = $("testBtn");
  btn.disabled = true;
  $("settingsStatus").textContent = "正在测试连接...";
  try {
    const result = await api.testProvider({
      baseURL: $("providerBase").value.trim(),
      apiKey: $("providerKey").value.trim(),
      name: $("providerName").value.trim(),
    });
    if (result.ok) {
      $("settingsStatus").textContent = `连接成功，可用模型 ${result.models?.length || 0} 个。`;
      if (result.models?.length) fillModels([...result.models, ...currentModels()]);
    } else {
      $("settingsStatus").textContent = `连接失败：${result.error}`;
    }
  } catch (err) {
    $("settingsStatus").textContent = `连接失败：${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

async function save() {
  const name = $("providerName").value.trim();
  const baseURL = $("providerBase").value.trim();
  const apiKey = $("providerKey").value.trim();
  const model = $("modelInput").value.trim();
  if (!name || !baseURL || !model) {
    $("settingsStatus").textContent = "服务商名称、接口地址、模型名不能为空。";
    return;
  }
  const btn = $("settingsSave");
  btn.disabled = true;
  $("settingsStatus").textContent = "正在保存...";
  try {
    let providerId = editingId;
    if (isNew) {
      const r = await api.saveProvider({
        name, baseURL, apiKey,
        models: [model],
        visionModel: $("visionModel").value.trim(),
        supportsVision: $("supportsVision").checked,
      });
      providerId = r.provider.id;
      editingId = providerId;
      isNew = false;
    }
    const saved = await api.saveSettings({
      providerId,
      name,
      baseURL,
      apiKey,
      model,
      visionModel: $("visionModel").value.trim(),
      supportsVision: $("supportsVision").checked,
      temperature: Number($("temperature").value),
      maxTokens: Number($("maxTokens").value),
      maxSteps: Number($("maxSteps").value),
      showReasoning: $("showReasoning").checked,
    });
    cfg = saved.config;
    state.settings = cfg;
    state.providers = cfg.providers || [];
    renderProviders();
    $("settingsStatus").textContent = "已保存。";
    updateModelPill();
    onSaved(cfg);
    notify("设置已保存");
    setTimeout(closeSettings, 350);
  } catch (err) {
    $("settingsStatus").textContent = `保存失败：${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

export function updateModelPill() {
  const cfg = state.settings;
  const pill = $("modelPill");
  if (!cfg) { pill.textContent = "未配置模型"; return; }
  const p = (cfg.providers || []).find(x => x.id === cfg.activeProvider);
  pill.textContent = `${p?.name || "接口"} · ${cfg.activeModel || "未选模型"}`;
  pill.title = `${p?.baseURL || ""}\n${cfg.activeModel || ""}`;
}

export async function refreshSettingsSummary() {
  try {
    const cfg = await api.settings();
    state.settings = cfg;
    state.providers = cfg.providers || [];
    updateModelPill();
    return cfg;
  } catch {
    return null;
  }
}
