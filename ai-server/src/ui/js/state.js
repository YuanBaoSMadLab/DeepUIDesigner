export const state = {
  sessionId: sessionStorage.getItem("omni-session") || `s-${Date.now().toString(36)}`,
  uiFilePath: "",
  uiContent: "",
  selectedElement: null,
  selection: null,
  attached: true,
  running: false,
  abort: null,
  settings: null,
  providers: [],
  shots: [],
  lastRun: null,
  connected: false,
};

sessionStorage.setItem("omni-session", state.sessionId);

export function parseSelection(xml) {
  if (!xml || typeof xml !== "string") return null;
  const widgets = xml.match(/<widget\b/g) || [];
  const name = (xml.match(/<widget[^>]*\bname="([^"]+)"/) || [])[1] || "";
  const cls = (xml.match(/<widget[^>]*\bclass="([^"]+)"/) || [])[1] || "";
  return {
    name,
    className: cls,
    count: widgets.length,
    label: widgets.length > 1 ? `${widgets.length} 个控件` : (name || cls || "未命名控件"),
  };
}

export function basename(p) {
  if (!p) return "";
  const parts = String(p).split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

export function setSelection(xml) {
  state.selectedElement = xml || null;
  state.selection = parseSelection(xml);
}

export function addShot(shot, label) {
  state.shots.unshift({
    url: shot.url,
    path: shot.path,
    label: label || "界面截图",
    time: new Date().toISOString(),
    width: shot.width,
    height: shot.height,
  });
  state.shots = state.shots.slice(0, 12);
}
