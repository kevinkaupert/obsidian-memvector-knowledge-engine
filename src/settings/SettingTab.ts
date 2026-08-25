import { PluginSettingTab, type App, type Plugin } from "obsidian";
import { getTranslation } from "../i18n";
import { renderLanguageSection } from "./sections/languageSection";
import { renderLlmProviderSection } from "./sections/llmProviderSection";
import { renderMemgraphSection } from "./sections/memgraphSection";
import { renderQdrantSection } from "./sections/qdrantSection";
import { renderVectorFilterSection } from "./sections/vectorFilterSection";
import type { SettingsHost } from "./types";

export class MathWikiSettingTab extends PluginSettingTab {
  private readonly host: SettingsHost;

  constructor(app: App, plugin: Plugin & SettingsHost) {
    super(app, plugin);
    this.host = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const t = getTranslation(this.host.settings.language || "de");
    const rerender = () => this.display();

    containerEl.createEl("h2", { text: t.settingsTitle });
    containerEl.createEl("p", { text: t.settingsDesc, cls: "setting-item-description" });

    renderLanguageSection(containerEl, this.host, t, rerender);
    renderLlmProviderSection(containerEl, this.host, t, rerender);
    renderVectorFilterSection(containerEl, this.host, t, rerender);
    renderQdrantSection(containerEl, this.app, this.host, t);
    renderMemgraphSection(containerEl, this.app, this.host, t);
  }
}
