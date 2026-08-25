import { Setting } from "obsidian";
import type { TranslationKeys } from "../../i18n";
import type { SettingsHost } from "../types";

export function renderLanguageSection(
  containerEl: HTMLElement,
  host: SettingsHost,
  t: TranslationKeys,
  rerender: () => void
): void {
  containerEl.createEl("h3", { text: t.secGeneral });

  new Setting(containerEl)
    .setName(t.langName)
    .setDesc(t.langDesc)
    .addDropdown((dropdown) =>
      dropdown
        .addOption("de", "Deutsch")
        .addOption("en", "English")
        .setValue(host.settings.language)
        .onChange(async (value) => {
          host.settings.language = value;
          await host.saveSettings();
          rerender();
        })
    );
}
