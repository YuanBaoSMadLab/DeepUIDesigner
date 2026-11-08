import { Router, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import {
  CONFIG_PATH, activeProvider, loadConfig, publicConfig, saveConfig,
  slug, testProvider, updateActiveProvider, Provider, SERVER_ROOT,
} from "../ai/config.js";

const router = Router();
const ENV_PATH = path.join(SERVER_ROOT, ".env");

router.get("/", (_req: Request, res: Response) => {
  const cfg = loadConfig();
  res.json(publicConfig(cfg));
});

router.post("/", (req: Request, res: Response) => {
  const cfg = loadConfig();
  const b = req.body as any;
  if (b.providerId && cfg.providers.some(p => p.id === b.providerId)) {
    cfg.activeProvider = b.providerId;
  }
  if (b.name !== undefined || b.baseURL !== undefined || b.apiKey !== undefined ||
    b.model !== undefined || b.visionModel !== undefined || b.supportsVision !== undefined) {
    updateActiveProvider(cfg, {
      name: b.name,
      baseURL: b.baseURL,
      apiKey: b.apiKey,
      model: b.model,
      visionModel: b.visionModel,
      supportsVision: b.supportsVision,
    });
  }
  if (b.temperature !== undefined) cfg.agent.temperature = clamp(Number(b.temperature), 0, 2, 0.3);
  if (b.maxTokens !== undefined) cfg.agent.maxTokens = clamp(Number(b.maxTokens), 256, 32000, 4096);
  if (b.maxSteps !== undefined) cfg.agent.maxSteps = clamp(Number(b.maxSteps), 1, 40, 16);
  if (b.showReasoning !== undefined) cfg.agent.showReasoning = !!b.showReasoning;
  saveConfig(cfg);
  syncEnv(cfg);
  res.json({ ok: true, config: publicConfig(cfg) });
});

router.get("/providers", (_req: Request, res: Response) => {
  const cfg = loadConfig();
  res.json({ activeProvider: cfg.activeProvider, activeModel: cfg.activeModel, providers: cfg.providers });
});

router.post("/providers", (req: Request, res: Response) => {
  const cfg = loadConfig();
  const b = req.body as Partial<Provider> & { id?: string };
  const id = b.id || slug(b.name || `provider-${cfg.providers.length + 1}`);
  const idx = cfg.providers.findIndex(p => p.id === id);
  const prev = idx >= 0 ? cfg.providers[idx] : null;
  const provider: Provider = {
    id,
    name: b.name || prev?.name || id,
    baseURL: (b.baseURL || prev?.baseURL || "https://api.openai.com/v1").replace(/\/+$/, ""),
    apiKey: b.apiKey !== undefined ? b.apiKey : prev?.apiKey || "",
    models: Array.isArray(b.models) && b.models.length ? b.models : prev?.models || ["gpt-4o-mini"],
    visionModel: b.visionModel !== undefined ? b.visionModel : prev?.visionModel || "",
    supportsVision: b.supportsVision !== undefined ? !!b.supportsVision : !!prev?.supportsVision,
  };
  if (idx >= 0) cfg.providers[idx] = provider;
  else cfg.providers.push(provider);
  cfg.activeProvider = id;
  if (!provider.models.includes(cfg.activeModel)) cfg.activeModel = provider.models[0];
  saveConfig(cfg);
  res.json({ ok: true, provider });
});

router.delete("/providers/:id", (req: Request, res: Response) => {
  const cfg = loadConfig();
  if (cfg.providers.length <= 1) {
    res.status(400).json({ ok: false, error: "至少保留一个服务商" });
    return;
  }
  cfg.providers = cfg.providers.filter(p => p.id !== req.params.id);
  if (!cfg.providers.some(p => p.id === cfg.activeProvider)) {
    cfg.activeProvider = cfg.providers[0].id;
    cfg.activeModel = cfg.providers[0].models[0];
  }
  saveConfig(cfg);
  res.json({ ok: true });
});

router.post("/test", async (req: Request, res: Response) => {
  const cfg = loadConfig();
  const b = req.body as Partial<Provider> & { providerId?: string };
  let provider: Provider | undefined;
  if (b.providerId) provider = cfg.providers.find(p => p.id === b.providerId);
  if (!provider) {
    provider = {
      id: "test",
      name: b.name || "测试",
      baseURL: b.baseURL || activeProvider(cfg)?.baseURL || "",
      apiKey: b.apiKey !== undefined ? b.apiKey : activeProvider(cfg)?.apiKey || "",
      models: b.models || [],
      visionModel: b.visionModel,
      supportsVision: b.supportsVision,
    };
  } else if (b.baseURL || b.apiKey) {
    provider = { ...provider, baseURL: b.baseURL || provider.baseURL, apiKey: b.apiKey ?? provider.apiKey };
  }
  const result = await testProvider(provider);
  res.json(result);
});

router.get("/models", async (req: Request, res: Response) => {
  const cfg = loadConfig();
  const pid = (req.query.provider as string) || cfg.activeProvider;
  const provider = cfg.providers.find(p => p.id === pid) || activeProvider(cfg);
  if (!provider) { res.json({ models: [] }); return; }
  const result = await testProvider(provider);
  res.json({
    ok: result.ok,
    models: result.ok ? result.models : provider.models,
    error: result.error,
    configured: provider.models,
  });
});

function clamp(n: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function syncEnv(cfg: ReturnType<typeof loadConfig>): void {
  try {
    const p = activeProvider(cfg);
    if (!p) return;
    fs.writeFileSync(
      ENV_PATH,
      `API_KEY=${p.apiKey}\nMODEL=${cfg.activeModel}\nBASE_URL=${p.baseURL}\n`,
      "utf-8"
    );
  } catch { /* 配置文件才是主存储，失败不影响 */ }
}

export { CONFIG_PATH };
export default router;
