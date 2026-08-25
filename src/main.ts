import { Plugin, type WorkspaceLeaf } from "obsidian";
import { MathWikiSettingTab } from "./settings/SettingTab";
import { migrateSettings } from "./settings/apiKeyMigration";
import { DEFAULT_SETTINGS } from "./settings/defaults";
import type { MemVectorSettings } from "./settings/types";
import { MATH_WIKI_VIEW_TYPE } from "./constants";
import { MathWikiSidebarView } from "./views/sidebar/MathWikiSidebarView";

// NOTE: vector-scatter view registration, ribbon icon, and command are
// added in phase 6 — see the plan file for sequencing.
export default class MemVectorPlugin extends Plugin {
  settings: MemVectorSettings = DEFAULT_SETTINGS;
  private sidebarView: MathWikiSidebarView | null = null;

  async onload(): Promise<void> {
    console.log("Loading MemVector Knowledge Engine Plugin...");
    await this.loadSettings();
    this.addSettingTab(new MathWikiSettingTab(this.app, this));

    this.registerView(MATH_WIKI_VIEW_TYPE, (leaf: WorkspaceLeaf) => {
      const view = new MathWikiSidebarView(leaf, () => this.settings);
      this.sidebarView = view;
      return view;
    });

    this.addRibbonIcon("function-square", "MemVector Co-Pilot Seitenleiste", () => {
      this.activateSidebarView();
    });

    this.addCommand({
      id: "open-math-wiki-sidebar",
      name: "MemVector: Seitenleiste öffnen",
      callback: () => this.activateSidebarView(),
    });

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.sidebarView?.renderView();
      })
    );
    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        this.sidebarView?.renderView();
      })
    );
  }

  async activateSidebarView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(MATH_WIKI_VIEW_TYPE)[0];
    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false) ?? workspace.getRightLeaf(true);
      if (rightLeaf) {
        await rightLeaf.setViewState({ type: MATH_WIKI_VIEW_TYPE, active: true });
        leaf = rightLeaf;
      }
    }
    if (leaf) workspace.revealLeaf(leaf);
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
