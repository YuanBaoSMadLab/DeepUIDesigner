async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data?.error || data?.raw || `HTTP ${res.status}`);
  return data;
}

export const api = {
  get: (url) => request(url),
  post: (url, body) => request(url, { method: "POST", body: JSON.stringify(body || {}) }),
  del: (url) => request(url, { method: "DELETE" }),

  health: () => request("/api/health"),
  getUiState: () => request("/api/ui/state"),
  updateUiState: (data) => request("/api/ui/update", { method: "POST", body: JSON.stringify(data) }),

  settings: () => request("/api/settings"),
  saveSettings: (data) => request("/api/settings", { method: "POST", body: JSON.stringify(data) }),
  providers: () => request("/api/settings/providers"),
  saveProvider: (data) => request("/api/settings/providers", { method: "POST", body: JSON.stringify(data) }),
  deleteProvider: (id) => request(`/api/settings/providers/${encodeURIComponent(id)}`, { method: "DELETE" }),
  testProvider: (data) => request("/api/settings/test", { method: "POST", body: JSON.stringify(data) }),
  models: (provider) => request(`/api/settings/models?provider=${encodeURIComponent(provider)}`),

  history: (path) => request(`/api/history?path=${encodeURIComponent(path)}`),
  diff: (path, id) => request(`/api/history/diff?path=${encodeURIComponent(path)}&id=${encodeURIComponent(id)}`),
  revert: (path, id) => request("/api/history/revert", { method: "POST", body: JSON.stringify({ path, id }) }),
  revertLast: (path) => request("/api/history/revert-last", { method: "POST", body: JSON.stringify({ path }) }),
  revertSession: (path, sessionId) => request("/api/history/revert-session", { method: "POST", body: JSON.stringify({ path, sessionId }) }),
  snapshot: (path, label) => request("/api/history/snapshot", { method: "POST", body: JSON.stringify({ path, label }) }),
  file: (path) => request(`/api/history/file?path=${encodeURIComponent(path)}`),
  saveFile: (path, content) => request("/api/history/file", { method: "POST", body: JSON.stringify({ path, content }) }),

  screenshot: (process) => request("/api/tools/screenshot", { method: "POST", body: JSON.stringify({ process }) }),
  layout: (path) => request("/api/tools/layout", { method: "POST", body: JSON.stringify({ path }) }),

  clear: (sessionId) => request("/api/chat/clear", { method: "POST", body: JSON.stringify({ sessionId }) }),
};

export async function streamAgent(payload, onEvent, signal) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try { const j = await res.json(); message = j.error || message; } catch { /* ignore */ }
    throw new Error(message);
  }
  if (!res.body) throw new Error("服务端没有返回流");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLines = block.split(/\r?\n/).filter(l => l.startsWith("data:")).map(l => l.slice(5).trim());
      if (!dataLines.length) continue;
      const raw = dataLines.join("\n");
      try { onEvent(JSON.parse(raw)); } catch { /* ignore malformed */ }
    }
  }
  if (buffer.trim().startsWith("data:")) {
    try { onEvent(JSON.parse(buffer.trim().slice(5).trim())); } catch { /* ignore */ }
  }
}
