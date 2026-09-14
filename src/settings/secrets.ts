import type { App } from "obsidian";
import { DEFAULT_SETTINGS } from "./defaults";
import type { ApiKeyMap, LlmProvider, MemVectorSettings } from "./types";

/**
 * Legacy fixed secret IDs from before this module resolved SecretComponent-selected
 * names. Per Obsidian's SecretStorage contract, a SecretComponent's onChange value is
 * the NAME of a secret, not the secret itself - settings must store that name and
 * resolve the real value via getSecret() at request time. These fixed IDs double as
 * the initial selected name for installs that already had a raw value stored under
 * them by the pre-fix code, so existing keys keep working without re-entry.
 */
function legacyLlmSecretId(provider: LlmProvider): string {
  return `memvector-llm-key-${provider}`;
}
const LEGACY_EMBEDDING_SECRET_ID = "memvector-embedding-api-key";

/** The secret name currently selected for a provider's LLM API key - used to pre-fill its SecretComponent. */
export function getSelectedLlmSecretName(settings: MemVectorSettings, provider: LlmProvider): string {
  return settings.llmApiKeySecretNames?.[provider] || legacyLlmSecretId(provider);
}

/** Records which secret name the user selected via SecretComponent for a provider's LLM API key. */
export function setSelectedLlmSecretName(settings: MemVectorSettings, provider: LlmProvider, secretName: string): void {
  settings.llmApiKeySecretNames = { ...settings.llmApiKeySecretNames, [provider]: secretName };
}

/** Resolves the actual API key for a provider by looking up its selected secret name in SecretStorage. */
export function resolveApiKeyFor(app: App, settings: MemVectorSettings, provider: LlmProvider): string {
  const secretName = getSelectedLlmSecretName(settings, provider);
  return app.secretStorage.getSecret(secretName) ?? (provider === "ollama" ? "ollama" : "");
}

/** The secret name currently selected for the embedding API key - used to pre-fill its SecretComponent. */
export function getSelectedEmbeddingSecretName(settings: MemVectorSettings): string {
  return settings.embeddingApiKeySecretName || LEGACY_EMBEDDING_SECRET_ID;
}

/** Records which secret name the user selected via SecretComponent for the embedding API key. */
export function setSelectedEmbeddingSecretName(settings: MemVectorSettings, secretName: string): void {
  settings.embeddingApiKeySecretName = secretName;
}

/** Resolves the actual embedding API key by looking up the selected secret name in SecretStorage. */
export function resolveEmbeddingApiKey(app: App, settings: MemVectorSettings): string {
  const secretName = getSelectedEmbeddingSecretName(settings);
  return app.secretStorage.getSecret(secretName) ?? "ollama";
}

const LEGACY_SECRET_FIELDS = ["apiKeys", "deepseekApiKey", "embeddingApiKey", "qdrantApiKey", "memgraphPassword"];

export function migrateSettings(loaded: unknown): MemVectorSettings {
  const merged = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {}) as MemVectorSettings & Record<string, unknown>;
  for (const field of LEGACY_SECRET_FIELDS) delete merged[field];
  return merged;
}

/** Migrates pre-SecretStorage plaintext settings fields into SecretStorage under the legacy fixed IDs, which resolveApiKeyFor/resolveEmbeddingApiKey fall back to until a secret is explicitly (re)selected. */
export function migrateSecretsToSecretStorage(app: App, raw: unknown, settings: MemVectorSettings): boolean {
  const r = (raw as Record<string, unknown>) || {};
  let migrated = false;

  const legacyApiKeys = (r.apiKeys as ApiKeyMap) || {};
  const legacyDeepseek = typeof r.deepseekApiKey === "string" ? r.deepseekApiKey : undefined;
  if (legacyDeepseek && !legacyApiKeys[settings.llmProvider]) {
    legacyApiKeys[settings.llmProvider] = legacyDeepseek;
  }
  for (const [provider, key] of Object.entries(legacyApiKeys)) {
    const id = legacyLlmSecretId(provider as LlmProvider);
    if (key && !app.secretStorage.getSecret(id)) {
      app.secretStorage.setSecret(id, key);
      migrated = true;
    }
  }

  if (typeof r.embeddingApiKey === "string" && r.embeddingApiKey && !app.secretStorage.getSecret(LEGACY_EMBEDDING_SECRET_ID)) {
    app.secretStorage.setSecret(LEGACY_EMBEDDING_SECRET_ID, r.embeddingApiKey);
    migrated = true;
  }

  return migrated;
}
