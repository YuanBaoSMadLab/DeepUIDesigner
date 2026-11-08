import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONFIG_PATH = path.join(SERVER_ROOT, "config.json");
const ENV_PATH = path.join(SERVER_ROOT, ".env");

export interface Provider {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  models: string[];
  visionModel?: string;
  supportsVision?: boolean;
}

export interface AgentOptions {
  temperature: number;
  maxTokens: number;
  maxSteps: number;
  showReasoning: boolean;
}

export interface AppConfig {
  activeProvider: string;
  activeModel: string;
  providers: Provider[];
  agent: AgentOptions;
}

/** DeepSeek 当前在售模型：deepseek-chat / deepseek-reasoner 已于 2026-07-24 弃用 */
const DEFAULT_MODELS = ["deepseek-flash", "deepseek-v4-pro"];

/** 旧模型名自动迁移，避免沿用已下线模型导致 404 */
const MODEL_ALIASES: Record<string, string> = {
  "deepseek-chat": "deepseek-flash",
  "deepseek-reasoner": "deepseek-flash",
  "deepseek-coder": "deepseek-flash",
  "deepseek-v4-flash": "deepseek-flash",
  "deepseek-v4-flash-vision-exp": "deepseek-flash",
};

export function migrateModelName(name: string): string {
  return MODEL_ALIASES[name] || name;
}

function readEnv(): Record<string, string> {
  if (!fs.existsSync(ENV_PATH)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(ENV_PATH, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}

function defaultConfig(): AppConfig {
  const env = readEnv();
  const apiKey = env.API_KEY || process.env.API_KEY || process.env.DEEPSEEK_API_KEY || "";
  const baseURL = env.BASE_URL || process.env.BASE_URL || "https://api.deepseek.com";
  const model = migrateModelName(env.MODEL || process.env.MODEL || "deepseek-flash");
  return {
    activeProvider: "default",
    activeModel: model,
    providers: [
      {
        id: "default",
        name: "OpenAI 兼容接口",
        baseURL,
        apiKey,
        models: Array.from(new Set([model, ...DEFAULT_MODELS])),
        visionModel: "",
        supportsVision: baseURL.includes("deepseek.com"),
      },
    ],
    agent: {
      temperature: 0.3,
      maxTokens: 4096,
      maxSteps: 16,
      showReasoning: true,
    },
  };
}

export function loadConfig(): AppConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    const cfg = defaultConfig();
    saveConfig(cfg);
    return cfg;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as Partial<AppConfig>;
    const fallback = defaultConfig();
    const providers = Array.isArray(raw.providers) && raw.providers.length > 0
      ? raw.providers.map(normalizeProvider)
      : fallback.providers;
    const cfg: AppConfig = {
      activeProvider: raw.activeProvider || providers[0].id,
      activeModel: migrateModelName(raw.activeModel || providers[0].models[0] || fallback.activeModel),
      providers,
      agent: { ...fallback.agent, ...(raw.agent || {}) },
    };
    const current = cfg.providers.find(p => p.id === cfg.activeProvider);
    if (current && !current.models.includes(cfg.activeModel)) {
      current.models = [cfg.activeModel, ...current.models];
    }
    if (!cfg.providers.some(p => p.id === cfg.activeProvider)) {
      cfg.activeProvider = cfg.providers[0].id;
    }
    return cfg;
  } catch {
    return defaultConfig();
  }
}

function normalizeProvider(p: Partial<Provider>): Provider {
  const models = Array.from(new Set(
    (Array.isArray(p.models) && p.models.length > 0 ? p.models : ["gpt-5.6"]).map(migrateModelName)
  ));
  return {
    id: p.id || slug(p.name || `provider-${Date.now()}`),
    name: p.name || p.id || "未命名服务商",
    baseURL: p.baseURL || "https://api.openai.com/v1",
    apiKey: p.apiKey || "",
    models,
    visionModel: p.visionModel || "",
    supportsVision: !!p.supportsVision,
  };
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `p-${Date.now()}`;
}

export function saveConfig(cfg: AppConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
}

/** 只暴露给本机前端，密钥保持可编辑，但额外给出是否已配置 */
export function publicConfig(cfg: AppConfig) {
  return {
    ...cfg,
    hasKey: !!activeProvider(cfg)?.apiKey,
    configPath: CONFIG_PATH,
  };
}

export function activeProvider(cfg: AppConfig): Provider | undefined {
  return cfg.providers.find(p => p.id === cfg.activeProvider) || cfg.providers[0];
}

export function activeCredentials(cfg: AppConfig): Provider {
  const p = activeProvider(cfg);
  if (!p) throw new Error("没有可用的模型服务商，请在设置中添加");
  if (!p.apiKey) throw new Error(`服务商「${p.name}」尚未配置 API 密钥`);
  return p;
}

export function updateActiveProvider(
  cfg: AppConfig,
  patch: Partial<Provider> & { model?: string }
): AppConfig {
  const idx = Math.max(0, cfg.providers.findIndex(p => p.id === cfg.activeProvider));
  const current = cfg.providers[idx] || normalizeProvider({});
  const next: Provider = {
    ...current,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.baseURL !== undefined ? { baseURL: patch.baseURL.replace(/\/+$/, "") } : {}),
    ...(patch.apiKey !== undefined ? { apiKey: patch.apiKey.trim() } : {}),
    ...(patch.visionModel !== undefined ? { visionModel: patch.visionModel.trim() } : {}),
    ...(patch.supportsVision !== undefined ? { supportsVision: patch.supportsVision } : {}),
  };
  if (patch.model) {
    const model = migrateModelName(patch.model.trim());
    if (!next.models.includes(model)) next.models = [model, ...next.models];
    cfg.activeModel = model;
  }
  cfg.providers[idx] = next;
  return cfg;
}

export async function testProvider(p: Provider): Promise<{ ok: boolean; models?: string[]; error?: string }> {
  if (!p.apiKey) return { ok: false, error: "缺少 API 密钥" };
  const base = p.baseURL.replace(/\/+$/, "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${p.apiKey}` },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status} ${text.slice(0, 200)}` };
    }
    const data = await res.json() as { data?: Array<{ id?: string }> };
    return { ok: true, models: (data.data || []).map(m => m.id).filter(Boolean) as string[] };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

export { CONFIG_PATH, SERVER_ROOT };
