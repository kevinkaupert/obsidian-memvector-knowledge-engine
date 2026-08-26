import { Notice, Plugin, type WorkspaceLeaf } from "obsidian";
import { MathWikiSettingTab } from "./settings/SettingTab";
import { migrateSettings } from "./settings/apiKeyMigration";
import { DEFAULT_SETTINGS } from "./settings/defaults";
import type { MemVectorSettings } from "./settings/types";
import { MATH_VECTOR_SCATTER_VIEW_TYPE, MATH_WIKI_VIEW_TYPE } from "./constants";
import { MathWikiSidebarView } from "./views/sidebar/MathWikiSidebarView";
import { VectorScatterView } from "./views/vectorScatter/VectorScatterView";
import { flushPendingMemgraphRelations } from "./sync/memgraph/pendingRelationsQueue";

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
        this.sidebarView?.renderView();
      })
    );
    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        this.sidebarView?.renderView();
      })
    );

    this.tryFlushPendingMemgraphRelations();
  }

  /** Best-effort: relations created while Memgraph was unreachable get retried once it's back, without blocking startup. */
  private tryFlushPendingMemgraphRelations(): void {
    if (!this.settings.autoSyncMemgraph || this.settings.pendingMemgraphRelations.length === 0) return;
    flushPendingMemgraphRelations(this.settings, () => this.saveSettings())
      .then((count) => {
        if (count > 0) new Notice(`✅ ${count} zuvor ausstehende Beziehung(en) mit Memgraph synchronisiert.`);
      })
      .catch(() => {
        // Still unreachable - stays queued, retried again next time (plugin load, successful connection test, or manual sync).
      });
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
