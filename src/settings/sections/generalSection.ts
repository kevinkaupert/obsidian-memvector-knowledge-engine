import { Setting } from "obsidian";
import type { TranslationKeys } from "../../i18n";
import type { ScatterVisualStyle, SettingsHost } from "../types";

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

  const exclusionSetting = new Setting(containerEl)
    .setName(t.exclusionsName)
    .setDesc(t.exclusionsDesc);
  exclusionSetting.settingEl.addClass("memvector-setting-block");
  exclusionSetting.controlEl.addClass("memvector-setting-full-width");
  exclusionSetting.addTextArea((text) => {
    text.inputEl.rows = 3;
    text.inputEl.addClass("memvector-textarea-mono");
    text
      .setPlaceholder("-path:archiv -file:templates tag:#privat")
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
        .onChange(async (value) => {
          settings.unselectedLabelOpacity = value / 100;
          await host.saveSettings();
        })
    );

  new Setting(containerEl)
    .setName(t.radarCountName)
    .setDesc(t.radarCountDesc)
    .addText((text) => {
      text.inputEl.addClass("memvector-input-narrow");
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

  new Setting(containerEl)
    .setName(t.lblShowRelationNotes)
    .setDesc(t.showRelationNotesDesc)
    .addToggle((toggle) =>
      toggle.setValue(settings.showRelationNotes ?? false).onChange(async (value) => {
        settings.showRelationNotes = value;
        await host.saveSettings();
      })
    );

  new Setting(containerEl)
    .setName(t.scatterStyleName)
    .setDesc(t.scatterStyleDesc)
    .addDropdown((dropdown) =>
      dropdown
        .addOption("monochrome", t.styleMonochrome)
        .addOption("muted", t.styleMuted)
        .addOption("ink", t.styleInk)
        .setValue(settings.scatterVisualStyle || "ink")
        .onChange(async (value) => {
          settings.scatterVisualStyle = value as ScatterVisualStyle;
          await host.saveSettings();
        })
    );

  new Setting(containerEl).setName(t.secGeneralSynthesis).setHeading();

  new Setting(containerEl)
    .setName(t.synthAgentsToggle)
    .setDesc(t.agentsIncludeDesc)
    .addToggle((toggle) =>
      toggle.setValue(settings.includeAgentsGuidelines ?? false).onChange(async (value) => {
        settings.includeAgentsGuidelines = value;
        await host.saveSettings();
      })
    );

  const agentsSetting = new Setting(containerEl)
    .setName(t.agentsPathsName)
    .setDesc(t.agentsPathsDesc);
  agentsSetting.settingEl.addClass("memvector-setting-block");
  agentsSetting.controlEl.addClass("memvector-setting-full-width");
  agentsSetting.addTextArea((text) => {
    text.inputEl.rows = 2;
    text.inputEl.addClass("memvector-textarea-mono");
    text
      .setPlaceholder("AGENTS.md")
      .setValue(settings.agentsGuidelinePaths || "")
      .onChange(async (value) => {
        settings.agentsGuidelinePaths = value;
        await host.saveSettings();
      });
  });

  new Setting(containerEl)
    .setName(t.agentsGuidelinesCapTitle)
    .setDesc(t.agentsGuidelinesCapDesc)
    .addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.min = "0";
      text
        .setPlaceholder("0")
        .setValue(String(settings.agentsGuidelinesCharCap ?? 0))
        .onChange(async (value) => {
          const parsed = parseInt(value, 10);
          settings.agentsGuidelinesCharCap = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
          await host.saveSettings();
        });
    });
}
