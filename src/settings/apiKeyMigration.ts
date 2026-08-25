import { DEFAULT_SETTINGS } from "./defaults";
import type { LlmProvider, MemVectorSettings } from "./types";

/**
 * Bugfix #3: main.js used a single `deepseekApiKey` field for whatever
 * cloud LLM provider was currently selected, and reset it to "" every time
 * the provider dropdown changed (main.js:1118-1135) - switching
 * Claude -> OpenAI -> Claude silently wiped the Claude key. Settings now
 * carry a per-provider `apiKeys` map instead; this migrates any existing
 * install's old field into it once, on load, without deleting the legacy
 * field outright (kept for one release as a rollback safety net).
 */
export function migrateSettings(loaded: unknown): MemVectorSettings {
  const merged: MemVectorSettings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {});
  merged.apiKeys = { ...DEFAULT_SETTINGS.apiKeys, ...merged.apiKeys };

  const legacyKey = (loaded as Partial<MemVectorSettings> | undefined)?.deepseekApiKey;
  if (legacyKey && !merged.apiKeys[merged.llmProvider]) {
    merged.apiKeys[merged.llmProvider] = legacyKey;
  }

  return merged;
}

export function getApiKeyFor(settings: MemVectorSettings, provider: LlmProvider): string {
  return settings.apiKeys[provider] ?? "";
}

export function setApiKeyFor(settings: MemVectorSettings, provider: LlmProvider, key: string): void {
  settings.apiKeys = { ...settings.apiKeys, [provider]: key };
}
