import { Notice, ItemView, TFile, type App, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { getTranslation } from "../../i18n";
import { RelationBuilderModal } from "../../modals/relationBuilder/RelationBuilderModal";
import { loadRelationVocabulary } from "../../relationVocabulary/loadRelationVocabulary";
import { relationsFolder, resolveVocabularyPath } from "../../vaultLayout";
import { DEFAULT_RELATION_VOCABULARY } from "../../relationVocabulary/defaultVocabulary";
import type { RelationTermDef } from "../../relationVocabulary/types";
import type { MemVectorSettings } from "../../settings/types";
import { MATH_VECTOR_SCATTER_VIEW_TYPE } from "../../constants";
import { wireCanvasInteraction } from "./canvasInteraction";
import type { ScatterViewContext } from "./context";
import { hitTest as hitTestPure, hitTestEdge as hitTestEdgePure, type PanState } from "./hitTesting";
import { LayoutEngine, type LayoutMode } from "./layout/layoutEngine";
import type { ProjectionMode } from "./layout/projections";
import { draw } from "./rendering/drawOrchestrator";
import { drawSearchPulse } from "./rendering/drawSearchPulse";
import { loadRelationEdges as loadRelationEdgesPure } from "./relationEdges";
import { findNodesByQuery } from "./search";
import { runSynthesis } from "./synthesis";
import { getVectorStore } from "../../sync/storeFactory";
import { getStoredNodePositions, saveNodePositions } from "../../sync/sqlite/nodePositions";
import { buildToolbar, type ToolbarHandles } from "./toolbar/toolbar";
import { filterVisibleNodes, isRelationNode, type RelationEdge, type ScatterNode } from "./types";
import { scanVaultNotes as scanVaultNotesPure } from "./vaultScan";
import { isRelationNote } from "../../relationNotes";

const SEARCH_PULSE_DURATION_MS = 1800;

export interface VectorScatterHost {
  app: App;
  settings: MemVectorSettings;
  saveSettings(): Promise<void>;
  focusSidebarNote(file: TFile): void;
}

export interface NodePositionProvider {
  getNodePosition(path: string): { x: number; y: number } | null;
}

export class VectorScatterView extends ItemView implements ScatterViewContext, NodePositionProvider {
  /**
   * Purpose: Looks up the 2D canvas coordinates of a visible note by file path.
   */
  getNodePosition(path: string): { x: number; y: number } | null {
    const match = this.getVisibleNodes().find((n) => n.path === path);
    return match ? { x: match.x, y: match.y } : null;
  }

  /**
   * Purpose: Returns the currently visible scatter nodes according to display toggles.
   */
  getVisibleNodes(): ScatterNode[] {
    return filterVisibleNodes(this.nodes, this.showRelationNotes, relationsFolder(this.settings));
  }

  /**
   * Purpose: Re-reads the settings this view mirrors as local state and redraws, after they were
   * changed from outside the view (the plugin settings tab).
   * Architecture: Counterpart to MemVectorPlugin.applySettingsToOpenViews(). setShowRelationNotes
   * already persists and refreshes, so it is reused for the relation-note flag; everything else the
   * view reads straight off `this.settings` on each redraw. Settings that feed the layout (knowledge
   * domain, WikiLinks as relations) take effect through applyLayout, which does nothing when no layout
   * input changed.
   */
  applyExternalSettingsChange(options?: { relayout?: boolean; embeddings?: boolean }): void {
    if (options?.embeddings) this.reloadEmbeddings();
    // A vocabulary edit changes per-label attraction/repulsion, so the force layout
    // has to run again - a redraw alone would only repaint the old positions.
    if (options?.relayout) {
      this.refreshRelationEdges();
    }
    const show = this.settings.showRelationNotes ?? false;
    if (show !== this.showRelationNotes) {
      this.setShowRelationNotes(show);
      return;
    }
    if (this.settings.scatterEdgeHops !== undefined && this.settings.scatterEdgeHops !== this.edgeHops) {
      this.edgeHops = this.settings.scatterEdgeHops;
      this.toolbarHandles?.updateEdgeHops?.(this.edgeHops);
    }
    this.applyLayout();
    this.redraw();
  }

  /**
   * Purpose: Updates relation notes visibility toggle, sanitizes selection and search caches, and rescans on a change.
   * Architecture: Clears hidden relation notes from selectedNodeIds and resets search/hover state (Issue #110). The scan
   * already drops hidden relation notes so they do not take part in the layout, which makes the node list itself depend
   * on this flag: a redraw alone cannot bring them back, so a change triggers a view-preserving rescan (Issue #204).
   */
  setShowRelationNotes(show: boolean): void {
    const changed = show !== this.showRelationNotes;
    this.showRelationNotes = show;
    this.settings.showRelationNotes = show;
    void this.saveSettings();
    if (!show) {
      const pruned = new Set<string>();
      for (const id of this.selectedNodeIds) {
        const node = this.nodes.find((n) => n.id === id);
        if (node && !isRelationNode(node, relationsFolder(this.settings))) pruned.add(id);
      }
      this.selectedNodeIds = pruned;

      if (this.hoveredNode && isRelationNode(this.hoveredNode, relationsFolder(this.settings))) {
        this.hoveredNode = null;
      }

      this.lastSearchQuery = null;
      this.lastSearchMatches = [];
      this.lastSearchIndex = -1;

      if (this.searchHighlight) {
        const match = this.nodes.find((n) => n.id === this.searchHighlight?.nodeId);
        if (match && isRelationNode(match, relationsFolder(this.settings))) {
          this.searchHighlight = null;
          this.cancelSearchAnim();
        }
      }

      this.toolbarHandles?.updateSelectionUI();
    }
    this.redraw();
    if (changed) this.rescanForRelationNoteVisibility();
  }

  /**
   * Purpose: Rescans the vault after the relation-note visibility changed, keeping camera and known positions.
   */
  private rescanForRelationNoteVisibility(): void {
    void this.scanVaultNotes(undefined, { preserveView: true })
      .then(() => this.toolbarHandles?.updateSelectionUI())
      .catch((err) => console.error("MemVector: Failed to rescan after changing relation note visibility:", err));
  }

  viewFilterQuery = "";
  nodes: ScatterNode[] = [];
  selectedNodeIds = new Set<string>();
  pan = { x: 0, y: 0 };
  zoom = 1;
  isDraggingPan = false;
  isDraggingLasso = false;
  dragStart = { x: 0, y: 0 };
  lassoPath: { x: number; y: number }[] = [];
  lassoSelectMode = false;
  hoveredNode: ScatterNode | null = null;
  hoveredEdge: RelationEdge | null = null;
  showEdges = true;
  showRelationNotes = false;
  edgeHops = 1;
  relationEdges: RelationEdge[] = [];
  vocabulary: RelationTermDef[] = DEFAULT_RELATION_VOCABULARY;
  nodeSpacing = 350;
  cloudSpacing = 800;
  projectionMode: ProjectionMode = "graphvector";

  private positionsHydrated = false;
  private readonly layoutEngine = new LayoutEngine();
  private canvas!: HTMLCanvasElement;
  private canvasCtx!: CanvasRenderingContext2D;
  private canvasWrap!: HTMLElement;
  private resizeObserver: ResizeObserver | null = null;
  private interactionCleanup: (() => void) | null = null;
  private toolbarHandles: ToolbarHandles | null = null;
  private searchHighlight: { nodeId: string; startedAt: number } | null = null;
  /**
   * Pending search-pulse frame, kept together with the window that issued it. The view can be
   * dragged into an Obsidian popout, which has its own window object; a bare `window.` prefix
   * resolves to the window the plugin was loaded in, so the pulse would be scheduled on - and
   * cancelled against - a window the view no longer lives in.
   */
  private searchAnim: { win: Window; handle: number } | null = null;
  private lastSearchQuery: string | null = null;
  private lastSearchMatches: ScatterNode[] = [];
  private lastSearchIndex = -1;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly host: VectorScatterHost
  ) {
    super(leaf);
    this.app = host.app;
  }

  get settings(): MemVectorSettings {
    return this.host.settings;
  }

  saveSettings(): Promise<void> {
    return this.host.saveSettings();
  }

  getViewType(): string {
    return MATH_VECTOR_SCATTER_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "MemVector Graph";
  }

  getIcon(): string {
    return "dot-network";
  }

  /**
   * Purpose: Serializes canvas viewport camera state and view preferences to Obsidian workspace.
   */
  getState(): Record<string, unknown> {
    return {
      pan: this.pan,
      zoom: this.zoom,
      edgeHops: this.edgeHops,
    };
  }

  /**
   * Purpose: Restores canvas viewport camera state and view preferences from Obsidian workspace on startup.
   */
  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    if (state && typeof state === "object") {
      const s = state as { pan?: PanState; zoom?: number; edgeHops?: number };
      if (s.pan && typeof s.pan.x === "number" && typeof s.pan.y === "number") {
        this.pan = { x: s.pan.x, y: s.pan.y };
      }
      if (typeof s.zoom === "number" && !Number.isNaN(s.zoom)) {
        this.zoom = s.zoom;
      }
      if (typeof s.edgeHops === "number" && !Number.isNaN(s.edgeHops)) {
        this.edgeHops = s.edgeHops;
        this.toolbarHandles?.updateEdgeHops?.(this.edgeHops);
      }
      this.hasFittedView = true;
    }
    if (typeof super.setState === "function") {
      await super.setState(state, result);
    }
  }

  /**
   * Purpose: Initializes the scatter view canvas, toolbar, hoverbar, and scans vault notes on open.
   */
  async onOpen(): Promise<void> {
    this.containerEl.addClass("memvector-relative-container");
    const container = (this.containerEl.children[1] as HTMLElement | undefined) || this.containerEl;
    container.empty();
    container.addClass("math-vector-scatter-container");

    const canvasWrap = container.createDiv({ cls: "memvector-canvas-wrap" });
    this.canvasWrap = canvasWrap;

    const canvas = canvasWrap.createEl("canvas", { cls: "memvector-canvas" });
    this.canvas = canvas;
    const canvasCtx = canvas.getContext("2d");
    if (!canvasCtx) return;
    this.canvasCtx = canvasCtx;

    const toolbarEl = canvasWrap.createDiv({ cls: "memvector-toolbar" });

    const t = getTranslation(this.settings.language || "de");

    this.addAction("sliders", t.toggleToolbar, () => {
      toolbarEl.classList.toggle("is-hidden");
    });

    const hoverBar = container.createDiv({ cls: "memvector-hoverbar-container memvector-hoverbar" });

    this.nodeSpacing = this.settings.scatterNodeSpacing ?? 350;
    this.cloudSpacing = this.settings.scatterCloudSpacing ?? 800;
    this.showRelationNotes = this.settings.showRelationNotes ?? false;
    this.edgeHops = this.settings.scatterEdgeHops ?? this.edgeHops ?? 1;

    this.toolbarHandles = buildToolbar(this, { canvasWrap, canvas, toolbarEl, hoverBar }, t);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(canvasWrap);
    this.pan = { x: canvasWrap.clientWidth / 2, y: canvasWrap.clientHeight / 2 };

    this.interactionCleanup = wireCanvasInteraction(this, {
      canvas,
      canvasWrap,
      hoverBar,
      updateSelectionUI: () => this.toolbarHandles?.updateSelectionUI(),
    });

    const initScan = async () => {
      await this.scanVaultNotes();
      this.toolbarHandles?.updateSelectionUI();
    };

    if (this.app?.workspace?.onLayoutReady && !this.app.workspace.layoutReady) {
      this.app.workspace.onLayoutReady(() => {
        void initScan();
      });
    } else {
      await initScan();
    }

    this.registerVaultWatchers();
  }

  onClose(): Promise<void> {
    if (this.relationsDebounceTimer !== null) {
      window.clearTimeout(this.relationsDebounceTimer);
      this.relationsDebounceTimer = null;
    }
    if (this.vaultDebounceTimer !== null) {
      window.clearTimeout(this.vaultDebounceTimer);
      this.vaultDebounceTimer = null;
    }
    if (this.embeddingReloadTimer !== null) {
      window.clearTimeout(this.embeddingReloadTimer);
      this.embeddingReloadTimer = null;
    }
    this.interactionCleanup?.();
    this.interactionCleanup = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.cancelSearchAnim();
    return Promise.resolve();
  }

  private relationsDebounceTimer: number | null = null;
  private vaultDebounceTimer: number | null = null;

  /**
   * Purpose: Registers reactive vault event watchers to automatically update relation edges and notes when files change.
   * Architecture: Relation notes are edges *and* scatter nodes (shown with "show relation notes"). Editing one only
   * changes its edge, so a modify reloads edges; creating, deleting or renaming one changes the node set too and
   * needs a full rescan (which reloads the edges as well). The vocabulary file carries the per-label layout weights,
   * so any change to it reloads relations like an edge edit.
   */
  registerVaultWatchers(): void {
    if (!this.app?.vault?.on) return;

    const isVocabulary = (p?: string) => Boolean(p && p === resolveVocabularyPath(this.settings));
    const isRel = (file: { path: string }) =>
      isRelationNote(file.path, file instanceof TFile ? this.app.metadataCache?.getFileCache(file)?.frontmatter?.type : undefined, relationsFolder(this.settings));
    const isMd = (p?: string) => Boolean(p && p.endsWith(".md"));

    const handleFileEvent = (file: { path: string }, kind: "create" | "modify" | "delete") => {
      if (!file?.path) return;
      if (isVocabulary(file.path) || (kind === "modify" && isRel(file))) {
        this.triggerRelationsReload();
      } else if (isMd(file.path)) {
        this.triggerVaultRescan();
      }
    };

    const handleRenameEvent = (file: { path: string }, oldPath: string) => {
      if (isVocabulary(file?.path) || isVocabulary(oldPath)) {
        this.triggerRelationsReload();
      } else if (isMd(file?.path) || isMd(oldPath)) {
        this.triggerVaultRescan();
      }
    };

    this.registerEvent(this.app.vault.on("create", (file) => handleFileEvent(file, "create")));
    this.registerEvent(this.app.vault.on("modify", (file) => handleFileEvent(file, "modify")));
    this.registerEvent(this.app.vault.on("delete", (file) => handleFileEvent(file, "delete")));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => handleRenameEvent(file, oldPath)));
  }

  triggerRelationsReload(): void {
    if (this.relationsDebounceTimer !== null) window.clearTimeout(this.relationsDebounceTimer);
    this.relationsDebounceTimer = window.setTimeout(() => {
      void (async () => {
        await this.loadRelationEdges();
        this.applyLayout();
        this.redraw();
      })();
    }, 400);
  }

  triggerVaultRescan(): void {
    if (this.vaultDebounceTimer !== null) window.clearTimeout(this.vaultDebounceTimer);
    this.vaultDebounceTimer = window.setTimeout(() => {
      void (async () => {
        await this.scanVaultNotes(undefined, { preserveView: true });
        this.toolbarHandles?.updateSelectionUI();
      })();
    }, 800);
  }

  private hasFittedView = false;

  private handleResize(): void {
    const w = this.canvasWrap.clientWidth || 800;
    const h = this.canvasWrap.clientHeight || 600;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.hasFittedView && this.nodes.length > 0 && w > 100) {
      this.fitToView();
      this.hasFittedView = true;
    }
    this.redraw();
  }

  /**
   * Purpose: Adjusts pan and zoom to fit all currently visible scatter nodes within the canvas viewport.
   */
  fitToView(): void {
    const visibleNodes = this.getVisibleNodes();
    if (!this.canvasWrap || visibleNodes.length === 0) return;
    const w = this.canvasWrap.clientWidth || 800;
    const h = this.canvasWrap.clientHeight || 600;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const node of visibleNodes) {
      if (node.x < minX) minX = node.x;
      if (node.x > maxX) maxX = node.x;
      if (node.y < minY) minY = node.y;
      if (node.y > maxY) maxY = node.y;
    }

    const bboxW = Math.max(100, maxX - minX + 260);
    const bboxH = Math.max(100, maxY - minY + 260);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const scaleX = (w * 0.85) / bboxW;
    const scaleY = (h * 0.85) / bboxH;
    this.zoom = Math.min(1.2, Math.max(0.05, Math.min(scaleX, scaleY)));
    this.pan = {
      x: w / 2 - centerX * this.zoom,
      y: h / 2 - centerY * this.zoom,
    };
  }

  /**
   * Purpose: Orchestrates canvas redraw for visible nodes, clusters, edges, and selection highlights.
   */
  redraw(): void {
    if (!this.canvasCtx || !this.canvasWrap) return;
    const visibleNodes = this.getVisibleNodes();
    draw(this.canvasCtx, this.canvasWrap.clientWidth, this.canvasWrap.clientHeight, this.containerEl, {
      nodes: visibleNodes,
      zoom: this.zoom,
      pan: this.pan,
      projectionMode: this.projectionMode,
      showEdges: this.showEdges,
      edgeHops: this.edgeHops,
      relationEdges: this.relationEdges,
      selectedNodeIds: this.selectedNodeIds,
      hoveredNode: this.hoveredNode,
      hoveredEdge: this.hoveredEdge,
      isDraggingLasso: this.isDraggingLasso,
      lassoPath: this.lassoPath,
      scatterVisualStyle: this.settings.scatterVisualStyle,
      unselectedLabelOpacity: this.settings.unselectedLabelOpacity ?? 0.35,
    });

    if (this.searchHighlight) {
      const node = visibleNodes.find((n) => n.id === this.searchHighlight!.nodeId);
      if (node) {
        const accent = getComputedStyle(this.containerEl).getPropertyValue("--interactive-accent")?.trim() || "#38bdf8";
        drawSearchPulse(this.canvasCtx, node, performance.now() - this.searchHighlight.startedAt, this.zoom, this.pan, accent);
      }
    }
  }

  /**
   * Purpose: Scans vault notes using transient view filter and persistent indexing exclusions, then updates embeddings and layout.
   * Architecture: Explicit scans (opening the view, changing the filter) fit the camera to the new node set;
   * `preserveView` keeps the user's pan and zoom for background rescans triggered by the vault watcher, which fire
   * while the user is editing notes.
   */
  async scanVaultNotes(filterOverride?: string, options: { preserveView?: boolean } = {}): Promise<void> {
    if (filterOverride !== undefined) {
      this.viewFilterQuery = filterOverride;
    }
    const previousEmbeddings = new Map<string, number[]>();
    const previousPositions = new Map<string, { x: number; y: number }>();
    for (const node of this.nodes) {
      if (node.embedding && node.embedding.length > 0) {
        previousEmbeddings.set(node.path, node.embedding);
        previousEmbeddings.set(node.id, node.embedding);
      }
    }
    // Only carry forward in-memory coordinates if they are grounded in persistent storage.
    // If the previous scan failed hydration, carrying forward ungrounded PCA coordinates would
    // shadow the database and cause a deferred clobber on subsequent scans (Issue #184).
    if (this.positionsHydrated) {
      for (const node of this.nodes) {
        if (node.x !== 0 || node.y !== 0) {
          previousPositions.set(node.path, { x: node.x, y: node.y });
          previousPositions.set(node.id, { x: node.x, y: node.y });
        }
      }
    }

    this.nodes = await scanVaultNotesPure(
      this.app,
      this.viewFilterQuery,
      this.settings.vectorSearchExclusions,
      relationsFolder(this.settings),
      this.showRelationNotes
    );
    this.reconcileTransientState();

    for (const node of this.nodes) {
      const existingPos = previousPositions.get(node.path) ?? previousPositions.get(node.id);
      if (existingPos) {
        node.x = existingPos.x;
        node.y = existingPos.y;
      }
    }

    // Both must be in place *before* the layout pass below, or it falls back to
    // text/link/folder heuristics for a session that already has a semantic
    // index and typed relations on disk.
    await this.hydrateStoredEmbeddings(previousEmbeddings);
    await this.hydrateStoredPositions();
    await this.loadRelationEdges();
    this.applyLayout();
    if (!this.hasFittedView && !options.preserveView) {
      this.fitToView();
      this.hasFittedView = true;
    }
    this.redraw();
  }

  private embeddingReloadTimer: number | null = null;

  /**
   * Purpose: Replaces every node's embedding with the stored one after the embedding target or the index changed,
   * then re-runs the layout.
   * Architecture: In-memory vectors are discarded, not kept as fallback: after a model switch they belong to another
   * vector space. Debounced because the model and URL fields save on every keystroke.
   */
  reloadEmbeddings(): void {
    if (this.embeddingReloadTimer !== null) window.clearTimeout(this.embeddingReloadTimer);
    this.embeddingReloadTimer = window.setTimeout(() => {
      this.embeddingReloadTimer = null;
      void (async () => {
        for (const n of this.nodes) n.embedding = undefined;
        await this.hydrateStoredEmbeddings(new Map());
        this.applyLayout();
        this.redraw();
      })();
    }, 300);
  }

  /**
   * Purpose: Aligns selection, hover and the search cache with a freshly scanned node list.
   * Architecture: A rescan replaces every node object. Ids of deleted (or no longer visible) notes would otherwise stay
   * counted in the selection, and repeating a search would cycle through the old objects and pan to their stale
   * positions. The selection set is pruned in place because interaction handlers hold a reference to it.
   */
  private reconcileTransientState(): void {
    const visible = new Map(this.getVisibleNodes().map((n) => [n.id, n]));
    for (const id of [...this.selectedNodeIds]) {
      if (!visible.has(id)) this.selectedNodeIds.delete(id);
    }
    this.hoveredNode = this.hoveredNode ? (visible.get(this.hoveredNode.id) ?? null) : null;
    this.lastSearchQuery = null;
    this.lastSearchMatches = [];
    this.lastSearchIndex = -1;
  }

  /**
   * Purpose: Loads each scanned node's embedding from the vector store, so a reopened/rescanned graph uses the existing
   * semantic index instead of recomputing it through a provider.
   * Architecture: The store is the source of truth - it holds vectors re-indexed from Settings or another view, and is
   * scoped to the active embedding model. In-memory embeddings of the previous scan (`fallback`) are preserved when
   * the store does not return a vector for a note, ensuring in-memory layouts do not collapse.
   */
  private async hydrateStoredEmbeddings(fallback: Map<string, number[]>): Promise<void> {
    if (this.nodes.length === 0) return;
    let stored: Map<string, number[]>;
    try {
      const store = getVectorStore(this.app, this.settings);
      stored = await store.getVectors([...this.nodes.map((n) => n.path), ...this.nodes.map((n) => n.id)]);
    } catch (err) {
      console.warn("MemVector: Failed to hydrate stored embeddings before layout, keeping in-memory embeddings:", err);
      stored = fallback;
    }
    for (const n of this.nodes) {
      const v = stored.get(n.path) ?? stored.get(n.id);
      if (v) n.embedding = v;
    }
  }

  /**
   * Purpose: Loads each scanned node's persisted 2D coordinates from SQLite if unplaced.
   * Architecture: Preserves the user's mental map across restarts (ADR-0005). Fails safe
   * by gating position persistence so transient read errors never overwrite stored coordinates (Issue #184).
   */
  private async hydrateStoredPositions(): Promise<void> {
    if (this.nodes.length === 0) {
      this.positionsHydrated = true;
      return;
    }
    try {
      const queryKeys = [...this.nodes.map((n) => n.path), ...this.nodes.map((n) => n.id)];
      const stored = await getStoredNodePositions(this.app, queryKeys);
      this.nodes.forEach((n) => {
        if (n.x === 0 && n.y === 0) {
          const pos = stored.get(n.id) ?? stored.get(n.path);
          if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
            n.x = pos.x;
            n.y = pos.y;
          }
        }
      });
      this.positionsHydrated = true;
    } catch (err) {
      this.positionsHydrated = false;
      console.warn("MemVector: Failed to hydrate stored node positions, aborting position persistence to protect mental map:", err);
    }
  }

  /**
   * Purpose: Persists non-zero 2D coordinates of all currently placed nodes to SQLite.
   * Architecture: Preserves node positions across sessions and restarts (ADR-0005). Gated by
   * positionsHydrated to prevent overwriting valid storage on hydration failure (Issue #184).
   */
  private async persistCurrentPositions(): Promise<void> {
    if (!this.positionsHydrated || this.nodes.length === 0) return;
    try {
      const records = this.nodes
        .filter((n) => Number.isFinite(n.x) && Number.isFinite(n.y) && (n.x !== 0 || n.y !== 0))
        .map((n) => ({ id: n.id, path: n.path, x: n.x, y: n.y }));
      if (records.length > 0) {
        await saveNodePositions(this.app, records);
      }
    } catch (err) {
      console.warn("MemVector: Failed to persist node positions:", err);
    }
  }

  /**
   * Purpose: Lays out the nodes when a layout input changed, and persists positions only when the simulation ran.
   * Architecture: Data updates call this with "auto"; the layout engine compares the layout-input signatures with the
   * last completed pass and leaves every node in place when nothing relevant changed (ADR-0006).
   */
  applyLayout(mode: LayoutMode = "auto"): void {
    const { simulated } = this.layoutEngine.run(
      {
        nodes: this.nodes,
        relationEdges: this.relationEdges,
        vocabulary: this.vocabulary,
        settings: this.settings,
        nodeSpacing: this.nodeSpacing,
        cloudSpacing: this.cloudSpacing,
      },
      mode
    );
    if (simulated) void this.persistCurrentPositions();
  }

  async loadRelationEdges(): Promise<void> {
    this.relationEdges = await loadRelationEdgesPure(this.app, this.settings.vectorSearchExclusions, relationsFolder(this.settings));
    // Per-label attraction/repulsion comes from the vault's own vocabulary
    // file (ADR-0002); refresh it together with the edges so saved custom
    // types feed the force layout immediately.
    this.vocabulary = await loadRelationVocabulary(this.app, this.settings);
  }

  hitTest(mouseX: number, mouseY: number): ScatterNode | null {
    return hitTestPure(this.getVisibleNodes(), mouseX, mouseY, this.zoom, this.pan);
  }

  /** Lets the sidebar's "Nahestehende Notizen" radar show this exact note without switching the actual editor tab (a click here only selects for synthesis). */
  focusSidebar(node: ScatterNode): void {
    const file = this.app.vault.getAbstractFileByPath(node.path);
    if (file instanceof TFile) this.host.focusSidebarNote(file);
  }

  hitTestEdge(mouseX: number, mouseY: number): RelationEdge | null {
    const activeNodeIds = new Set(this.selectedNodeIds);
    if (this.hoveredNode) activeNodeIds.add(this.hoveredNode.id);
    return hitTestEdgePure(this.getVisibleNodes(), this.relationEdges, activeNodeIds, this.edgeHops, mouseX, mouseY, this.zoom, this.pan);
  }

  refreshRelationEdges(): void {
    // Also re-run layout, not just re-render edges - a saved/edited/deleted
    // relation must feed the force layout's topology weights too, not only
    // the drawn edge lines.
    void this.loadRelationEdges().then(() => {
      this.applyLayout();
      this.redraw();
    });
  }

  openRelationBuilder(selected: ScatterNode[]): void {
    new RelationBuilderModal(this.app, this, selected, undefined, () => this.refreshRelationEdges()).open();
  }

  /**
   * Purpose: Opens the relation builder modal pre-filled with an existing edge's metadata for editing or deletion.
   */
  editRelationEdge(edge: RelationEdge): void {
    const srcNode = this.nodes.find((n) => n.id.toLowerCase() === edge.srcId.toLowerCase());
    const tgtNode = this.nodes.find((n) => n.id.toLowerCase() === edge.tgtId.toLowerCase());
    if (!srcNode || !tgtNode) return;
    new RelationBuilderModal(
      this.app,
      this,
      [srcNode, tgtNode],
      { relType: edge.relType, description: edge.desc, path: edge.path, srcId: edge.srcId, tgtId: edge.tgtId },
      () => this.refreshRelationEdges()
    ).open();
  }

  /** Repeated Enter on the same query cycles through every match (looping back to the first) instead of jumping to the best match each time. */
  searchNote(query: string): void {
    const normalized = query.trim().toLowerCase();
    const isSameQuery = normalized === this.lastSearchQuery && this.lastSearchMatches.length > 0;

    if (isSameQuery) {
      this.lastSearchIndex = (this.lastSearchIndex + 1) % this.lastSearchMatches.length;
    } else {
      this.lastSearchQuery = normalized;
      this.lastSearchMatches = findNodesByQuery(this.getVisibleNodes(), query);
      this.lastSearchIndex = 0;
    }

    const match = this.lastSearchMatches[this.lastSearchIndex];
    if (!match) {
      const t = getTranslation(this.settings.language || "de");
      new Notice(`${t.searchNotFound} "${query}"`);
      return;
    }

    this.pan.x = this.canvasWrap.clientWidth / 2 - match.x * this.zoom;
    this.pan.y = this.canvasWrap.clientHeight / 2 - match.y * this.zoom;

    this.cancelSearchAnim();
    const startedAt = performance.now();
    this.searchHighlight = { nodeId: match.id, startedAt };

    const tick = (): void => {
      this.redraw();
      if (performance.now() - startedAt < SEARCH_PULSE_DURATION_MS) {
        this.scheduleSearchAnim(tick);
      } else {
        this.searchHighlight = null;
        this.searchAnim = null;
        this.redraw();
      }
    };
    this.scheduleSearchAnim(tick);
  }

  /** Schedules the next pulse frame on the window the view currently lives in. */
  private scheduleSearchAnim(tick: () => void): void {
    const win = this.containerEl.win;
    this.searchAnim = { win, handle: win.requestAnimationFrame(tick) };
  }

  /** Cancels a pending pulse frame against the window that issued it. */
  private cancelSearchAnim(): void {
    if (this.searchAnim === null) return;
    this.searchAnim.win.cancelAnimationFrame(this.searchAnim.handle);
    this.searchAnim = null;
  }

  async runSynthesis(setHoverText: (text: string) => void, customQuestion?: string, excludedContextIds?: ReadonlySet<string>): Promise<void> {
    const selected = this.nodes.filter((n) => this.selectedNodeIds.has(n.id));
    await runSynthesis(this.app, this.settings, selected, setHoverText, customQuestion, excludedContextIds);
  }
}
