import { Plugin } from "obsidian";
import { MathWikiSettingTab } from "./settings/SettingTab";
import { migrateSettings } from "./settings/apiKeyMigration";
import { DEFAULT_SETTINGS } from "./settings/defaults";
import type { MemVectorSettings } from "./settings/types";

// NOTE: view registration, ribbon icons, commands, and workspace event
// wiring are added back incrementally as their modules land (sidebar in
// phase 5, vector-scatter in phase 6) — see the plan file for sequencing.
export default class MemVectorPlugin extends Plugin {
  settings: MemVectorSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    console.log("Loading MemVector Knowledge Engine Plugin...");
    await this.loadSettings();
    this.addSettingTab(new MathWikiSettingTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    this.settings = migrateSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  onunload(): void {
    console.log("Unloading MemVector Knowledge Engine Plugin.");
  }
}
