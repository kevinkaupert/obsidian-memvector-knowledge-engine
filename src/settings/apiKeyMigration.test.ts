import { describe, expect, it } from "vitest";
import { getApiKeyFor, migrateSettings, setApiKeyFor } from "./apiKeyMigration";
import { DEFAULT_SETTINGS } from "./defaults";

// Regression guard for bug #3: main.js used one shared `deepseekApiKey`
// field for whatever cloud provider was selected, and reset it to "" on
// every provider switch (Claude -> OpenAI -> Claude wiped the Claude key).

describe("migrateSettings", () => {
  it("returns defaults when loading a fresh (empty) install", () => {
    const result = migrateSettings(undefined);
    expect(result.apiKeys).toEqual(DEFAULT_SETTINGS.apiKeys);
  });

  it("migrates a legacy deepseekApiKey into apiKeys[llmProvider]", () => {
    const result = migrateSettings({ llmProvider: "claude", deepseekApiKey: "sk-ant-legacy-key" });
    expect(result.apiKeys.claude).toBe("sk-ant-legacy-key");
  });

  it("does not overwrite an already-migrated per-provider key with the legacy field", () => {
    const result = migrateSettings({
      llmProvider: "claude",
      deepseekApiKey: "sk-ant-old",
      apiKeys: { claude: "sk-ant-current" },
    });
    expect(result.apiKeys.claude).toBe("sk-ant-current");
  });

  it("preserves keys for providers other than the currently selected one", () => {
    const result = migrateSettings({
      llmProvider: "openai",
      apiKeys: { claude: "sk-ant-key", openai: "sk-openai-key" },
    });
    expect(result.apiKeys.claude).toBe("sk-ant-key");
    expect(result.apiKeys.openai).toBe("sk-openai-key");
  });
});

describe("getApiKeyFor / setApiKeyFor", () => {
  it("switching providers no longer wipes previously entered keys (the actual bug scenario)", () => {
    const settings = migrateSettings(undefined);
    setApiKeyFor(settings, "openai", "sk-openai-fake");
    settings.llmProvider = "claude";
    setApiKeyFor(settings, "claude", "sk-ant-fake");
    settings.llmProvider = "openai";

    expect(getApiKeyFor(settings, "openai")).toBe("sk-openai-fake");
    expect(getApiKeyFor(settings, "claude")).toBe("sk-ant-fake");
  });

  it("returns an empty string for a provider with no stored key", () => {
    const settings = migrateSettings(undefined);
    expect(getApiKeyFor(settings, "deepseek")).toBe("");
  });
});
