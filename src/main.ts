import { Plugin, TFile, type WorkspaceLeaf } from "obsidian";
import { MathWikiSettingTab } from "./settings/SettingTab";
import { migrateSecretsToSecretStorage, migrateSettings } from "./settings/secrets";
import { DEFAULT_SETTINGS } from "./settings/defaults";
import type { MemVectorSettings } from "./settings/types";
import { MATH_VECTOR_SCATTER_VIEW_TYPE, MATH_WIKI_VIEW_TYPE } from "./constants";
import { MathWikiSidebarView } from "./views/sidebar/MathWikiSidebarView";
import { VectorScatterView } from "./views/vectorScatter/VectorScatterView";
import { setPluginId, setPluginDir, closeLocalDb } from "./sync/sqlite/sqliteDb";
import { getTranslation } from "./i18n";
import { resolveEmbeddingTarget } from "./sync/embeddingTarget";

export default class MemVectorPlugin extends Plugin {
  settings: MemVectorSettings = DEFAULT_SETTINGS;
  private sidebarView: MathWikiSidebarView | null = null;
  private sidebarDebounceTimer: number | null = null;
  /** Embedding fingerprint the open views were last hydrated for - see saveSettings. */
  private embeddingFingerprint = "";

  private triggerSidebarRender(): void {
    if (this.sidebarDebounceTimer !== null) {
      window.clearTimeout(this.sidebarDebounceTimer);
    }
    this.sidebarDebounceTimer = window.setTimeout(() => {
      this.sidebarDebounceTimer = null;
      void this.sidebarView?.renderView();
    }, 80);
  }

  /**
   * Purpose: Initializes plugin runtime, registers sidebar/scatter views, settings tab, and ribbon commands.
   */
  async onload(): Promise<void> {
    if (this.manifest.dir) {
      setPluginDir(this.manifest.dir);
    }
    setPluginId(this.manifest.id);
    await this.loadSettings();
    this.addSettingTab(new MathWikiSettingTab(this.app, this));

    this.registerView(MATH_WIKI_VIEW_TYPE, (leaf: WorkspaceLeaf) => {
      const view = new MathWikiSidebarView(leaf, () => this.settings);
      this.sidebarView = view;
      return view;
    });
    this.registerView(MATH_VECTOR_SCATTER_VIEW_TYPE, (leaf: WorkspaceLeaf) => new VectorScatterView(leaf, this));

    const t = getTranslation(this.settings.language || "de");

    this.addRibbonIcon("function-square", t.ribbonSidebar, () => {
      void this.activateSidebarView();
    });
    this.addRibbonIcon("dot-network", t.ribbonScatter, () => {
      void this.activateVectorScatterView();
    });

    this.addCommand({
      id: "open-math-wiki-sidebar",
      name: t.cmdOpenSidebar,
      callback: () => this.activateSidebarView(),
    });
    this.addCommand({
      id: "open-math-vector-scatterplot",
      name: t.cmdOpenScatter,
      callback: () => this.activateVectorScatterView(),
    });
    this.addCommand({
      id: "rearrange-vector-scatter-layout",
      name: t.cmdRearrangeScatter,
      checkCallback: (checking) => {
        const views = this.app.workspace
          .getLeavesOfType(MATH_VECTOR_SCATTER_VIEW_TYPE)
          .map((leaf) => leaf.view)
          .filter((view): view is VectorScatterView => view instanceof VectorScatterView);
        if (views.length === 0) return false;
        if (!checking) for (const view of views) void view.rearrangeLayout();
        return true;
      },
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
    if (leaf) await workspace.revealLeaf(leaf);
  }

  async activateVectorScatterView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(MATH_VECTOR_SCATTER_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeaf(true);
      if (leaf) await leaf.setViewState({ type: MATH_VECTOR_SCATTER_VIEW_TYPE, active: true });
    }
    if (leaf) await workspace.revealLeaf(leaf);
  }

  /** Lets the graph's click handler show a note's radar in the sidebar without switching the actual editor tab. */
  focusSidebarNote(file: TFile): void {
    void this.sidebarView?.renderView(file);
  }

  async loadSettings(): Promise<void> {
    const raw: unknown = await this.loadData();
    this.settings = migrateSettings(raw);
    this.embeddingFingerprint = resolveEmbeddingTarget(this.settings).fingerprint;
    // One-time move of any plaintext secrets left over from before 1.6.1
    // (per-provider LLM keys, the legacy shared deepseekApiKey, the
    // embedding/Qdrant API keys, the Memgraph password) into Obsidian's
    // own secretStorage - only persists if something actually moved.
    if (migrateSecretsToSecretStorage(this.app, raw, this.settings)) {
      await this.saveSettings();
    }
  }

  /**
   * Purpose: Persists settings; when the embedding model or endpoint changed, open 2D views reload their embeddings.
   * Architecture: Detected here rather than in each settings control, so every path that changes the embedding
   * target (provider switch, URL, model field or dropdown, connection test) is covered. Otherwise an open view keeps
   * vectors of the previous model in memory and feeds them into layout and GraphRAG enrichment.
   */
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    const fingerprint = resolveEmbeddingTarget(this.settings).fingerprint;
    if (fingerprint !== this.embeddingFingerprint) {
      this.embeddingFingerprint = fingerprint;
      this.applySettingsToOpenViews({ embeddings: true });
    }
  }

  /**
   * Purpose: Re-applies settings that the 2D view mirrors as local state and redraws every open instance.
   * Architecture: Visual style, relation-note visibility and friends were toolbar controls until 0.1.7
   * and redrew the canvas themselves. After the move into Settings, saveSettings() alone would leave an
   * open view stale until it is reopened, so the settings tab calls this right after persisting.
   */
  applySettingsToOpenViews(options?: { relayout?: boolean; embeddings?: boolean }): void {
    for (const leaf of this.app.workspace.getLeavesOfType(MATH_VECTOR_SCATTER_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof VectorScatterView) view.applyExternalSettingsChange(options);
    }
    this.triggerSidebarRender();
  }

  onunload(): void {
    if (this.sidebarDebounceTimer !== null) {
      window.clearTimeout(this.sidebarDebounceTimer);
      this.sidebarDebounceTimer = null;
    }
    void closeLocalDb();
  }
}
