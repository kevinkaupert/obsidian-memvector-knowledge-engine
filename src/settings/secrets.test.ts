import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./defaults";
import {
  getSelectedLlmSecretName,
  migrateSecretsToSecretStorage,
  migrateSettings,
  resolveApiKeyFor,
  resolveEmbeddingApiKey,
  setSelectedEmbeddingSecretName,
  setSelectedLlmSecretName,
} from "./secrets";

function fakeApp(initial: Record<string, string> = {}): App {
  const store = new Map(Object.entries(initial));
  return {
    secretStorage: {
      getSecret: (id: string) => store.get(id) ?? null,
      setSecret: (id: string, secret: string) => {
        store.set(id, secret);
      },
      listSecrets: () => [...store.keys()],
    },
  } as unknown as App;
}

describe("migrateSettings", () => {
  it("returns defaults when loading a fresh (empty) install", () => {
    expect(migrateSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("strips legacy plaintext secret fields so they never get written back to data.json", () => {
    const result = migrateSettings({
      llmProvider: "claude",
      deepseekApiKey: "sk-ant-legacy",
      apiKeys: { claude: "sk-ant" },
      qdrantApiKey: "qk",
      memgraphPassword: "pw",
    }) as unknown as Record<string, unknown>;
    expect(result.deepseekApiKey).toBeUndefined();
    expect(result.apiKeys).toBeUndefined();
    expect(result.qdrantApiKey).toBeUndefined();
    expect(result.memgraphPassword).toBeUndefined();
  });
});

describe("SecretComponent contract: settings store a secret NAME, never the raw value", () => {
  it("setSelectedLlmSecretName records the chosen secret's name, not its value", () => {
    const app = fakeApp({ "my-openai-key": "sk-openai-fake" });
    const settings = { ...DEFAULT_SETTINGS };

    // This is exactly what SecretComponent's onChange callback hands the plugin: a name.
    setSelectedLlmSecretName(settings, "openai", "my-openai-key");

    expect(settings.llmApiKeySecretNames?.openai).toBe("my-openai-key");
    expect(settings.llmApiKeySecretNames?.openai).not.toBe("sk-openai-fake");
  });

  it("resolveApiKeyFor looks up the selected name's value, rather than treating the name as the key", () => {
    const app = fakeApp({ "my-openai-key": "sk-openai-fake" });
    const settings = { ...DEFAULT_SETTINGS };
    setSelectedLlmSecretName(settings, "openai", "my-openai-key");

    expect(resolveApiKeyFor(app, settings, "openai")).toBe("sk-openai-fake");
  });

  it("switching providers no longer wipes previously entered keys", () => {
    const app = fakeApp({ "openai-secret": "sk-openai-fake", "claude-secret": "sk-ant-fake" });
    const settings = { ...DEFAULT_SETTINGS };
    setSelectedLlmSecretName(settings, "openai", "openai-secret");
    setSelectedLlmSecretName(settings, "claude", "claude-secret");

    expect(resolveApiKeyFor(app, settings, "openai")).toBe("sk-openai-fake");
    expect(resolveApiKeyFor(app, settings, "claude")).toBe("sk-ant-fake");
  });

  it("defaults ollama to the 'ollama' placeholder when nothing is stored", () => {
    expect(resolveApiKeyFor(fakeApp(), { ...DEFAULT_SETTINGS }, "ollama")).toBe("ollama");
  });

  it("returns an empty string for any other provider with no stored key", () => {
    expect(resolveApiKeyFor(fakeApp(), { ...DEFAULT_SETTINGS }, "deepseek")).toBe("");
  });

  it("rotating the secret's value (same name) takes effect without reselecting it", () => {
    const app = fakeApp({ "my-key": "sk-old" });
    const settings = { ...DEFAULT_SETTINGS };
    setSelectedLlmSecretName(settings, "openai", "my-key");
    expect(resolveApiKeyFor(app, settings, "openai")).toBe("sk-old");

    app.secretStorage.setSecret("my-key", "sk-rotated");
    expect(resolveApiKeyFor(app, settings, "openai")).toBe("sk-rotated");
  });

  it("embedding key follows the same name/value split as LLM keys", () => {
    const app = fakeApp({ "my-embed-secret": "emb-value" });
    const settings = { ...DEFAULT_SETTINGS };
    setSelectedEmbeddingSecretName(settings, "my-embed-secret");

    expect(settings.embeddingApiKeySecretName).toBe("my-embed-secret");
    expect(resolveEmbeddingApiKey(app, settings)).toBe("emb-value");
  });
});

describe("migrateSecretsToSecretStorage", () => {
  it("migrates a legacy deepseekApiKey into the currently selected provider's secret", () => {
    const app = fakeApp();
    const settings = { ...DEFAULT_SETTINGS, llmProvider: "claude" as const };
    const migrated = migrateSecretsToSecretStorage(app, { llmProvider: "claude", deepseekApiKey: "sk-ant-legacy" }, settings);
    expect(migrated).toBe(true);
    expect(resolveApiKeyFor(app, settings, "claude")).toBe("sk-ant-legacy");
  });

  it("migrates every entry of a legacy apiKeys map and embedding keys, resolvable without any explicit selection", () => {
    const app = fakeApp();
    const settings = { ...DEFAULT_SETTINGS };
    const migrated = migrateSecretsToSecretStorage(
      app,
      { apiKeys: { claude: "sk-ant", openai: "sk-oai" }, embeddingApiKey: "emb-key" },
      settings
    );
    expect(migrated).toBe(true);
    expect(resolveApiKeyFor(app, settings, "claude")).toBe("sk-ant");
    expect(resolveApiKeyFor(app, settings, "openai")).toBe("sk-oai");
    expect(resolveEmbeddingApiKey(app, settings)).toBe("emb-key");
  });

  it("does not overwrite a secret that's already present, and reports nothing migrated", () => {
    const app = fakeApp({ "memvector-embedding-api-key": "already-set" });
    const settings = { ...DEFAULT_SETTINGS };
    const migrated = migrateSecretsToSecretStorage(app, { embeddingApiKey: "should-not-apply" }, settings);
    expect(migrated).toBe(false);
    expect(resolveEmbeddingApiKey(app, settings)).toBe("already-set");
  });

  it("returns false for a fresh install with nothing to migrate", () => {
    const app = fakeApp();
    expect(migrateSecretsToSecretStorage(app, {}, DEFAULT_SETTINGS)).toBe(false);
  });

  it("a pre-fix install's raw value stays reachable through the legacy name as the default selection", () => {
    const app = fakeApp();
    const settings = { ...DEFAULT_SETTINGS };
    migrateSecretsToSecretStorage(app, { apiKeys: { claude: "sk-ant-legacy" } }, settings);

    // No explicit selection was ever made - getSelectedLlmSecretName must still resolve
    // to something whose value equals the migrated key, so nothing breaks for existing users.
    const selectedName = getSelectedLlmSecretName(settings, "claude");
    expect(app.secretStorage.getSecret(selectedName)).toBe("sk-ant-legacy");
  });
});
