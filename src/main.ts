import { Plugin, TFile, type WorkspaceLeaf } from "obsidian";
import { MathWikiSettingTab } from "./settings/SettingTab";
import { migrateSecretsToSecretStorage, migrateSettings } from "./settings/secrets";
import { DEFAULT_SETTINGS } from "./settings/defaults";
import type { MemVectorSettings } from "./settings/types";
import { MATH_VECTOR_SCATTER_VIEW_TYPE, MATH_WIKI_VIEW_TYPE } from "./constants";
import { MathWikiSidebarView } from "./views/sidebar/MathWikiSidebarView";
import { VectorScatterView } from "./views/vectorScatter/VectorScatterView";
import { setPluginId, closeLocalDb } from "./sync/sqlite/sqliteDb";

export default class MemVectorPlugin extends Plugin {
  settings: MemVectorSettings = DEFAULT_SETTINGS;
  private sidebarView: MathWikiSidebarView | null = null;
  private sidebarDebounceTimer: number | null = null;

  private triggerSidebarRender(): void {
    if (this.sidebarDebounceTimer !== null) {
      window.clearTimeout(this.sidebarDebounceTimer);
    }
    this.sidebarDebounceTimer = window.setTimeout(() => {
      this.sidebarDebounceTimer = null;
      this.sidebarView?.renderView();
    }, 80);
  }

  async onload(): Promise<void> {
    setPluginId(this.manifest.id);
    console.log("Loading MemVector Knowledge Engine Plugin...");
    await this.loadSettings();
    this.addSettingTab(new MathWikiSettingTab(this.app, this));

    this.registerView(MATH_WIKI_VIEW_TYPE, (leaf: WorkspaceLeaf) => {
      const view = new MathWikiSidebarView(leaf, () => this.settings);
      this.sidebarView = view;
      return view;
    });
    this.registerView(MATH_VECTOR_SCATTER_VIEW_TYPE, (leaf: WorkspaceLeaf) => new VectorScatterView(leaf, this));

    this.addRibbonIcon("function-square", "MemVector Co-Pilot Seitenleiste", () => {
      this.activateSidebarView();
    });
    this.addRibbonIcon("dot-network", "MemVector 2D Vektorraum", () => {
      this.activateVectorScatterView();
    });

    this.addCommand({
      id: "open-math-wiki-sidebar",
      name: "MemVector: Seitenleiste öffnen",
      callback: () => this.activateSidebarView(),
    });
    this.addCommand({
      id: "open-math-vector-scatterplot",
      name: "MemVector: 2D Vektor-Scatterplot öffnen",
      callback: () => this.activateVectorScatterView(),
    });

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.triggerSidebarRender();
      })
    );
    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        this.triggerSidebarRender();
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

  async activateVectorScatterView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(MATH_VECTOR_SCATTER_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeaf(true);
      if (leaf) await leaf.setViewState({ type: MATH_VECTOR_SCATTER_VIEW_TYPE, active: true });
    }
    if (leaf) workspace.revealLeaf(leaf);
  }

  /** Lets the graph's click handler show a note's radar in the sidebar without switching the actual editor tab. */
  focusSidebarNote(file: TFile): void {
    this.sidebarView?.renderView(file);
  }

  async loadSettings(): Promise<void> {
    const raw = await this.loadData();
    this.settings = migrateSettings(raw);
    // One-time move of any plaintext secrets left over from before 1.6.1
    // (per-provider LLM keys, the legacy shared deepseekApiKey, the
    // embedding/Qdrant API keys, the Memgraph password) into Obsidian's
    // own secretStorage - only persists if something actually moved.
    if (migrateSecretsToSecretStorage(this.app, raw, this.settings)) {
      await this.saveSettings();
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  onunload(): void {
    if (this.sidebarDebounceTimer !== null) {
      window.clearTimeout(this.sidebarDebounceTimer);
      this.sidebarDebounceTimer = null;
    }
    void closeLocalDb();
    console.log("Unloading MemVector Knowledge Engine Plugin.");
  }
}
