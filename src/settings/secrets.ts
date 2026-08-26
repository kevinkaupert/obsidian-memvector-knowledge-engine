import type { App } from "obsidian";
import { DEFAULT_SETTINGS } from "./defaults";
import type { ApiKeyMap, LlmProvider, MemVectorSettings } from "./types";

const EMBEDDING_SECRET_ID = "memvector-embedding-api-key";
const QDRANT_SECRET_ID = "memvector-qdrant-api-key";
const MEMGRAPH_SECRET_ID = "memvector-memgraph-password";

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

export function getQdrantApiKey(app: App): string {
  return app.secretStorage.getSecret(QDRANT_SECRET_ID) ?? "";
}

export function setQdrantApiKey(app: App, key: string): void {
  app.secretStorage.setSecret(QDRANT_SECRET_ID, key);
}

export function getMemgraphPassword(app: App): string {
  return app.secretStorage.getSecret(MEMGRAPH_SECRET_ID) ?? "";
}

export function setMemgraphPassword(app: App, password: string): void {
  app.secretStorage.setSecret(MEMGRAPH_SECRET_ID, password);
}

const LEGACY_SECRET_FIELDS = ["apiKeys", "deepseekApiKey", "embeddingApiKey", "qdrantApiKey", "memgraphPassword"];

/**
 * Non-secret settings merge. Object.assign would otherwise carry any of the
 * legacy plaintext secret fields above straight through from an existing
 * install's data.json (MemVectorSettings no longer declares them, but a
 * loaded JS object doesn't know that) - stripped here so a subsequent
 * saveSettings() can never write them back to disk, regardless of whether
 * migrateSecretsToSecretStorage below has run yet.
 */
export function migrateSettings(loaded: unknown): MemVectorSettings {
  const merged = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {}) as MemVectorSettings & Record<string, unknown>;
  for (const field of LEGACY_SECRET_FIELDS) delete merged[field];
  return merged;
}

/**
 * One-time move of every plaintext secret this plugin used to keep in
 * data.json (per-provider LLM keys, the pre-1.6 shared `deepseekApiKey`,
 * the embedding/Qdrant API keys, the Memgraph password) into
 * app.secretStorage (Obsidian 1.11.4+), then strips them from the settings
 * object so a subsequent saveSettings() never writes them back to disk.
 * Reads from `raw` (the untyped data.json contents) rather than `settings`,
 * since MemVectorSettings no longer declares these fields at all - an
 * existing install's data.json can still contain them at runtime even
 * though the type doesn't. Returns whether anything was migrated, so the
 * caller knows whether a saveSettings() is actually needed.
 */
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
  if (typeof r.qdrantApiKey === "string" && r.qdrantApiKey && !app.secretStorage.getSecret(QDRANT_SECRET_ID)) {
    setQdrantApiKey(app, r.qdrantApiKey);
    migrated = true;
  }
  if (typeof r.memgraphPassword === "string" && r.memgraphPassword && !app.secretStorage.getSecret(MEMGRAPH_SECRET_ID)) {
    setMemgraphPassword(app, r.memgraphPassword);
    migrated = true;
  }

  return migrated;
}
