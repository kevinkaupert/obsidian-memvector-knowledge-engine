import { PluginSettingTab, Setting, type App, type Plugin } from "obsidian";
import { getTranslation } from "../i18n";
import { renderGeneralSection } from "./sections/generalSection";
import { renderLlmProviderSection } from "./sections/llmProviderSection";
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

    new Setting(containerEl)
      .setName("Configuration")
      .setDesc(t.settingsDesc)
      .setHeading();

    renderGeneralSection(containerEl, this.host, t, rerender);
    renderVectorFilterSection(containerEl, this.app, this.host, t, rerender);
    renderLlmProviderSection(containerEl, this.app, this.host, t, rerender);
  }
}

