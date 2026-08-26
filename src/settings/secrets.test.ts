import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./defaults";
import {
  getApiKeyFor,
  getEmbeddingApiKey,
  getMemgraphPassword,
  getQdrantApiKey,
  migrateSecretsToSecretStorage,
  migrateSettings,
  setApiKeyFor,
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

describe("getApiKeyFor / setApiKeyFor", () => {
  it("switching providers no longer wipes previously entered keys (the original bug scenario)", () => {
    const app = fakeApp();
    setApiKeyFor(app, "openai", "sk-openai-fake");
    setApiKeyFor(app, "claude", "sk-ant-fake");

    expect(getApiKeyFor(app, "openai")).toBe("sk-openai-fake");
    expect(getApiKeyFor(app, "claude")).toBe("sk-ant-fake");
  });

  it("defaults ollama to the 'ollama' placeholder when nothing is stored", () => {
    expect(getApiKeyFor(fakeApp(), "ollama")).toBe("ollama");
  });

  it("returns an empty string for any other provider with no stored key", () => {
    expect(getApiKeyFor(fakeApp(), "deepseek")).toBe("");
  });
});

describe("migrateSecretsToSecretStorage", () => {
  it("migrates a legacy deepseekApiKey into the currently selected provider's secret", () => {
    const app = fakeApp();
    const settings = { ...DEFAULT_SETTINGS, llmProvider: "claude" as const };
    const migrated = migrateSecretsToSecretStorage(app, { llmProvider: "claude", deepseekApiKey: "sk-ant-legacy" }, settings);
    expect(migrated).toBe(true);
    expect(getApiKeyFor(app, "claude")).toBe("sk-ant-legacy");
  });

  it("migrates every entry of a legacy apiKeys map, embedding/qdrant keys, and the memgraph password", () => {
    const app = fakeApp();
    const settings = { ...DEFAULT_SETTINGS };
    const migrated = migrateSecretsToSecretStorage(
      app,
      { apiKeys: { claude: "sk-ant", openai: "sk-oai" }, embeddingApiKey: "emb-key", qdrantApiKey: "qd-key", memgraphPassword: "mg-pass" },
      settings
    );
    expect(migrated).toBe(true);
    expect(getApiKeyFor(app, "claude")).toBe("sk-ant");
    expect(getApiKeyFor(app, "openai")).toBe("sk-oai");
    expect(getEmbeddingApiKey(app)).toBe("emb-key");
    expect(getQdrantApiKey(app)).toBe("qd-key");
    expect(getMemgraphPassword(app)).toBe("mg-pass");
  });

  it("does not overwrite a secret that's already present, and reports nothing migrated", () => {
    const app = fakeApp({ "memvector-qdrant-api-key": "already-set" });
    const settings = { ...DEFAULT_SETTINGS };
    const migrated = migrateSecretsToSecretStorage(app, { qdrantApiKey: "should-not-apply" }, settings);
    expect(migrated).toBe(false);
    expect(getQdrantApiKey(app)).toBe("already-set");
  });

  it("returns false for a fresh install with nothing to migrate", () => {
    const app = fakeApp();
    expect(migrateSecretsToSecretStorage(app, {}, DEFAULT_SETTINGS)).toBe(false);
  });
});
