import { Setting } from "obsidian";
import type { TranslationKeys } from "../../i18n";
import type { SettingsHost } from "../types";

/** Everything that shapes overall plugin behavior rather than one specific provider/database - previously scattered across languageSection.ts and the top of vectorFilterSection.ts. */
export function renderGeneralSection(containerEl: HTMLElement, host: SettingsHost, t: TranslationKeys, rerender: () => void): void {
  const { settings } = host;
  containerEl.createEl("h3", { text: t.secGeneral });

  new Setting(containerEl)
    .setName(t.langName)
    .setDesc(t.langDesc)
    .addDropdown((dropdown) =>
      dropdown
        .addOption("de", "Deutsch")
        .addOption("en", "English")
        .setValue(settings.language)
        .onChange(async (value) => {
          settings.language = value;
          await host.saveSettings();
          rerender();
        })
    );

  new Setting(containerEl).setName(t.secGeneralScan).setHeading();

  new Setting(containerEl)
    .setName(t.exclusionsName)
    .setDesc(t.exclusionsDesc)
    .addTextArea((text) => {
      text.inputEl.rows = 3;
      text.inputEl.style.width = "100%";
      text.inputEl.style.minWidth = "300px";
      text.inputEl.style.fontFamily = "var(--font-monospace, monospace)";
      text.inputEl.style.fontSize = "0.85em";
      text
        .setPlaceholder("-path:schema -file:index -file:log -file:README -file:AGENTS -file:PROFILE -file:canvas-")
        .setValue(settings.vectorSearchExclusions || "")
        .onChange(async (value) => {
          settings.vectorSearchExclusions = value;
          await host.saveSettings();
        });
    });

  new Setting(containerEl)
    .setName(t.labelOpacityName)
    .setDesc(t.labelOpacityDesc)
    .addSlider((slider) =>
      slider
        .setLimits(0, 100, 5)
        .setValue(Math.round((settings.unselectedLabelOpacity ?? 0.35) * 100))
        .setDynamicTooltip()
        .onChange(async (value) => {
          settings.unselectedLabelOpacity = value / 100;
          await host.saveSettings();
        })
    );

  new Setting(containerEl)
    .setName(t.radarCountName)
    .setDesc(t.radarCountDesc)
    .addText((text) => {
      text.inputEl.style.width = "80px";
      text
        .setPlaceholder("10")
        .setValue(String(settings.radarNoteCount || 10))
        .onChange(async (value) => {
          const num = parseInt(value, 10);
          if (!Number.isNaN(num) && num > 0) {
            settings.radarNoteCount = num;
            await host.saveSettings();
          }
        });
    });

  new Setting(containerEl).setName(t.secGeneralSynthesis).setHeading();

  new Setting(containerEl)
    .setName(t.agentsPathsName)
    .setDesc(t.agentsPathsDesc)
    .addTextArea((text) => {
      text.inputEl.rows = 2;
      text.inputEl.style.width = "100%";
      text.inputEl.style.minWidth = "300px";
      text.inputEl.style.fontFamily = "var(--font-monospace, monospace)";
      text.inputEl.style.fontSize = "0.85em";
      text
        .setPlaceholder("AGENTS.md, meta/PROFILE.md")
        .setValue(settings.agentsGuidelinePaths || "")
        .onChange(async (value) => {
          settings.agentsGuidelinePaths = value;
          await host.saveSettings();
        });
    });

  new Setting(containerEl)
    .setName(t.relVocabPathName)
    .setDesc(t.relVocabPathDesc)
    .addText((text) => {
      text.inputEl.style.width = "100%";
      text.inputEl.style.minWidth = "300px";
      text.inputEl.style.fontFamily = "var(--font-monospace, monospace)";
      text.inputEl.style.fontSize = "0.85em";
      text
        .setPlaceholder("wiki/relation-types.json")
        .setValue(settings.relationVocabularyPath || "")
        .onChange(async (value) => {
          settings.relationVocabularyPath = value;
          await host.saveSettings();
        });
    });
}
