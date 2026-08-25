import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS } from "./settings/defaults";
import type { MemVectorSettings } from "./settings/types";

// NOTE: this is a Phase-1 scaffolding skeleton. View registration, ribbon
// icons, commands, and workspace event wiring are added back incrementally
// in later phases as their modules land (sidebar in phase 5, vector-scatter
// in phase 6, settings tab in phase 3) — see the plan file for the full
// sequencing. Until then this only proves the build/load pipeline works.
export default class MemVectorPlugin extends Plugin {
  settings: MemVectorSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    console.log("Loading MemVector Knowledge Engine Plugin...");
    await this.loadSettings();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  onunload(): void {
    console.log("Unloading MemVector Knowledge Engine Plugin.");
  }
}
