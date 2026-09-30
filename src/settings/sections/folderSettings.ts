import { Setting } from "obsidian";
import type { TranslationKeys } from "../../i18n";
import type { MemVectorSettings, SettingsHost } from "../types";
import { DEFAULT_PRESETS_FOLDER, DEFAULT_RELATIONS_FOLDER, DEFAULT_SYNTHESIS_FOLDER, normalizeFolder } from "../../vaultLayout";

type FolderKey = "relationsFolder" | "synthesisFolder" | "presetsFolder";

/**
 * Purpose: Renders the vault folder settings (relation notes, synthesis notes, presets).
 * Architecture: Committed on blur or Enter, like the vocabulary path field - saving per keystroke would store
 * half-typed folders, and the next write would create them in the vault. A changed relations folder reloads the open
 * views' edges, since it is the fallback criterion for relation notes; a changed presets folder re-renders Settings so
 * the preset list follows it.
 */
export function renderFolderSettings(containerEl: HTMLElement, host: SettingsHost, t: TranslationKeys, rerender: () => void): void {
  new Setting(containerEl).setName(t.secGeneralFolders).setHeading();

  const rows: { key: FolderKey; name: string; desc: string; fallback: string }[] = [
    { key: "relationsFolder", name: t.folderRelationsName, desc: t.folderRelationsDesc, fallback: DEFAULT_RELATIONS_FOLDER },
    { key: "synthesisFolder", name: t.folderSynthesisName, desc: t.folderSynthesisDesc, fallback: DEFAULT_SYNTHESIS_FOLDER },
    { key: "presetsFolder", name: t.folderPresetsName, desc: t.folderPresetsDesc, fallback: DEFAULT_PRESETS_FOLDER },
  ];

  for (const row of rows) {
    new Setting(containerEl)
      .setName(row.name)
      .setDesc(row.desc)
      .addText((text) => {
        text.inputEl.addClass("memvector-textarea-mono");
        text.setPlaceholder(row.fallback).setValue(normalizeFolder(host.settings[row.key], row.fallback));

        const commit = async (): Promise<void> => {
          const next = normalizeFolder(text.getValue(), row.fallback);
          const settings: MemVectorSettings = host.settings;
          if (next === normalizeFolder(settings[row.key], row.fallback)) {
            text.setValue(next);
            return;
          }
          settings[row.key] = next;
          await host.saveSettings();
          if (row.key === "relationsFolder") host.applySettingsToOpenViews?.({ relayout: true });
          rerender();
        };

        text.inputEl.addEventListener("blur", () => void commit());
        text.inputEl.addEventListener("keydown", (ev: KeyboardEvent) => {
          if (ev.key !== "Enter") return;
          ev.preventDefault();
          void commit();
        });
      });
  }
}
