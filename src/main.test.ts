import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
  Plugin: class {
    app = {};
    loadData = vi.fn(async () => ({}));
    saveData = vi.fn(async () => undefined);
  },
  TFile: class {},
}));
vi.mock("./settings/SettingTab", () => ({ MathWikiSettingTab: class {} }));
vi.mock("./views/sidebar/MathWikiSidebarView", () => ({ MathWikiSidebarView: class {} }));
vi.mock("./views/vectorScatter/VectorScatterView", () => ({ VectorScatterView: class {} }));

import MemVectorPlugin from "./main";

async function loadedPlugin(): Promise<MemVectorPlugin> {
  const plugin = new (MemVectorPlugin as unknown as new () => MemVectorPlugin)();
  await plugin.loadSettings();
  plugin.applySettingsToOpenViews = vi.fn();
  return plugin;
}

describe("MemVectorPlugin.saveSettings pushes embedding target changes to open views (#175)", () => {
  it("asks open views to reload embeddings when the model changes", async () => {
    const plugin = await loadedPlugin();
    plugin.settings.embeddingModel = "nomic-embed-text";
    await plugin.saveSettings();
    expect(plugin.applySettingsToOpenViews).toHaveBeenCalledWith({ embeddings: true });
  });

  it("asks open views to reload embeddings when the endpoint changes", async () => {
    const plugin = await loadedPlugin();
    plugin.settings.embeddingApiBaseUrl = "http://gpu-box:11434/v1";
    await plugin.saveSettings();
    expect(plugin.applySettingsToOpenViews).toHaveBeenCalledWith({ embeddings: true });
  });

  it("does not reload for unrelated settings or an equivalent spelling of the same endpoint", async () => {
    const plugin = await loadedPlugin();
    plugin.settings.temperature = 0.7;
    await plugin.saveSettings();
    plugin.settings.embeddingApiBaseUrl = `${plugin.settings.embeddingApiBaseUrl}/`;
    await plugin.saveSettings();
    expect(plugin.applySettingsToOpenViews).not.toHaveBeenCalled();
  });
});
