export const bridge = {
  connected: false,
  api: null,
  last: { uiFilePath: "", uiFileContent: "", selectedElement: null },
};

let retries = 0;
let onChange = null;
let pollTimer = null;

export function initBridge(handler) {
  onChange = handler;
  attempt();
}

function attempt() {
  if (typeof window.QWebChannel === "undefined") {
    if (retries++ < 40) setTimeout(attempt, 500);
    return;
  }
  if (typeof window.qt === "undefined" || !window.qt.webChannelTransport) {
    if (retries++ < 60) setTimeout(attempt, 700);
    return;
  }
  try {
    new window.QWebChannel(window.qt.webChannelTransport, (channel) => {
      const obj = channel.objects && channel.objects.aiBridge;
      if (!obj) {
        if (retries++ < 20) setTimeout(attempt, 800);
        return;
      }
      bridge.api = obj;
      window.aiBridge = obj;
      bridge.connected = true;
      try { obj.stateChanged?.connect?.(() => push()); } catch { /* ignore */ }
      push();
      if (!pollTimer) {
        pollTimer = setInterval(() => push(false), 1500);
      }
    });
  } catch {
    if (retries++ < 20) setTimeout(attempt, 1000);
  }
}

function push(force = true) {
  if (!bridge.api) return;
  try {
    const next = {
      uiFilePath: String(bridge.api.uiFilePath || ""),
      uiFileContent: String(bridge.api.uiFileContent || ""),
      selectedElement: bridge.api.selectedElement || null,
    };
    const changed = force ||
      next.uiFilePath !== bridge.last.uiFilePath ||
      next.selectedElement !== bridge.last.selectedElement;
    if (!changed && next.uiFileContent === bridge.last.uiFileContent) return;
    bridge.last = next;
    if (onChange) onChange(next);
  } catch { /* 属性未就绪 */ }
}

export function readBridgeState() {
  return bridge.last;
}

export function refreshDesigner() {
  return new Promise((resolve) => {
    const api = bridge.api;
    if (!api) { resolve({ ok: false, error: "Qt 桥接未就绪" }); return; }
    let settled = false;
    const done = (r) => {
      if (settled) return;
      settled = true;
      const text = typeof r === "string" ? r : (r?.message || "OK");
      resolve({ ok: /^OK/i.test(String(text)), text: String(text) });
    };
    const timer = setTimeout(() => {
      if (!settled) { settled = true; resolve({ ok: false, error: "刷新超时" }); }
    }, 10000);
    try {
      const ret = api.refreshDesigner((r) => { clearTimeout(timer); done(r); });
      if (typeof ret === "string") { clearTimeout(timer); done(ret); }
    } catch (err) {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    }
  });
}

export function selectWidget(name) {
  return new Promise((resolve) => {
    const api = bridge.api;
    if (!api || !api.selectWidget) { resolve(false); return; }
    try { api.selectWidget(name, (ok) => resolve(!!ok)); } catch { resolve(false); }
  });
}
