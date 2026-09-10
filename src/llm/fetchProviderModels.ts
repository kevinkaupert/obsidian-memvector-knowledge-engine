import { requestUrl } from "../obsidianCompat";
import { ANTHROPIC_FALLBACK_MODELS } from "./modelDefaults";
import { buildModelsUrl, detectProvider } from "./providerRouting";

interface RawModelEntry {
  id?: string;
  name?: string;
}

interface RawModelResponse {
  data?: (string | RawModelEntry)[];
  models?: (string | RawModelEntry)[];
}

function parseModelList(rawText: string): string[] {
  const data = JSON.parse(rawText || "{}") as RawModelResponse | (string | RawModelEntry)[] | null;
  let rawList: (string | RawModelEntry)[] = [];
  if (Array.isArray(data)) {
    rawList = data;
  } else if (data && typeof data === "object") {
    rawList = data.data || data.models || [];
  }
  return rawList.map((m) => (typeof m === "string" ? m : m.id || m.name || "")).filter(Boolean);
}

/**
 * Relocated from MathWikiSidebarView.ts (main.js:990-1064) — fetching the
 * available model list is LLM-provider logic, not sidebar-view logic.
 */
export async function fetchProviderModels(apiBaseUrl: string, apiKey: string, llmProvider = ""): Promise<string[]> {
  const cleanKey = (apiKey || "").trim();
  const provider = detectProvider(apiBaseUrl, "", llmProvider);

  if (provider === "anthropic") {
    if (cleanKey && cleanKey !== "ollama") {
      try {
        const res = await requestUrl({
          url: buildModelsUrl(provider, apiBaseUrl),
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": cleanKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          throwOnError: false,
        });
        if (res.status === 200) {
          const models = parseModelList(res.text);
          if (models.length > 0) return models;
        }
      } catch (err) {
        console.warn("MemVector: Anthropic model list fetch failed, using static fallback list", err);
      }
    }
    return [...ANTHROPIC_FALLBACK_MODELS];
  }

  const targetUrl = buildModelsUrl(provider, apiBaseUrl);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cleanKey && cleanKey !== "ollama") {
    headers["Authorization"] = `Bearer ${cleanKey}`;
  }

  const res = await requestUrl({ url: targetUrl, method: "GET", headers, throwOnError: false });

  if (res.status === 200) {
    const models = parseModelList(res.text);
    if (models.length > 0) return models;
    throw new Error("Keine Modelle vom Provider erhalten (Antwort leer).");
  }

  let errMsg = res.text;
  try {
    const errJson = JSON.parse(res.text || "{}") as { error?: { message?: string } } | null;
    if (errJson?.error?.message) errMsg = errJson.error.message;
  } catch {
    console.warn("MemVector: model-list error response wasn't JSON, showing raw text");
  }
  if (res.status === 401) {
    throw new Error(`HTTP 401 Unauthorized: Ungültiger API-Key für ${targetUrl}`);
  }
  throw new Error(`HTTP ${res.status}: ${errMsg || "Modell-Abfrage fehlgeschlagen"} (${targetUrl})`);
}
