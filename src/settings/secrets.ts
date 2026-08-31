import type { App } from "obsidian";
import { DEFAULT_SETTINGS } from "./defaults";
import type { ApiKeyMap, LlmProvider, MemVectorSettings } from "./types";

const EMBEDDING_SECRET_ID = "memvector-embedding-api-key";

function llmSecretId(provider: LlmProvider): string {
  return `memvector-llm-key-${provider}`;
}

export function getApiKeyFor(app: App, provider: LlmProvider): string {
  return app.secretStorage.getSecret(llmSecretId(provider)) ?? (provider === "ollama" ? "ollama" : "");
}

export function setApiKeyFor(app: App, provider: LlmProvider, key: string): void {
  app.secretStorage.setSecret(llmSecretId(provider), key);
}

export function getEmbeddingApiKey(app: App): string {
  return app.secretStorage.getSecret(EMBEDDING_SECRET_ID) ?? "ollama";
}

export function setEmbeddingApiKey(app: App, key: string): void {
  app.secretStorage.setSecret(EMBEDDING_SECRET_ID, key);
}

const LEGACY_SECRET_FIELDS = ["apiKeys", "deepseekApiKey", "embeddingApiKey", "qdrantApiKey", "memgraphPassword"];

export function migrateSettings(loaded: unknown): MemVectorSettings {
  const merged = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {}) as MemVectorSettings & Record<string, unknown>;
  for (const field of LEGACY_SECRET_FIELDS) delete merged[field];
  return merged;
}

export function migrateSecretsToSecretStorage(app: App, raw: unknown, settings: MemVectorSettings): boolean {
  const r = (raw as Record<string, unknown>) || {};
  let migrated = false;

  const legacyApiKeys = (r.apiKeys as ApiKeyMap) || {};
  const legacyDeepseek = typeof r.deepseekApiKey === "string" ? r.deepseekApiKey : undefined;
  if (legacyDeepseek && !legacyApiKeys[settings.llmProvider]) {
    legacyApiKeys[settings.llmProvider] = legacyDeepseek;
  }
  for (const [provider, key] of Object.entries(legacyApiKeys)) {
    if (key && !app.secretStorage.getSecret(llmSecretId(provider as LlmProvider))) {
      setApiKeyFor(app, provider as LlmProvider, key);
      migrated = true;
    }
  }

  if (typeof r.embeddingApiKey === "string" && r.embeddingApiKey && !app.secretStorage.getSecret(EMBEDDING_SECRET_ID)) {
    setEmbeddingApiKey(app, r.embeddingApiKey);
    migrated = true;
  }

  return migrated;
}

