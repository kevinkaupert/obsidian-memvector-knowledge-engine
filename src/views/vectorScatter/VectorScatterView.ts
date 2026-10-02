import { Notice, ItemView, TFile, type App, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { getTranslation } from "../../i18n";
import { RelationBuilderModal } from "../../modals/relationBuilder/RelationBuilderModal";
import { loadRelationVocabulary } from "../../relationVocabulary/loadRelationVocabulary";
import { relationsFolder, resolveVocabularyPath } from "../../vaultLayout";
import { DEFAULT_RELATION_VOCABULARY } from "../../relationVocabulary/defaultVocabulary";
import type { RelationTermDef } from "../../relationVocabulary/types";
import type { MemVectorSettings, OpenViewSettingsChange } from "../../settings/types";
import { MATH_VECTOR_SCATTER_VIEW_TYPE } from "../../constants";
import { wireCanvasInteraction } from "./canvasInteraction";
import type { ScatterViewContext } from "./context";
import { hitTest as hitTestPure, hitTestEdge as hitTestEdgePure, type PanState } from "./hitTesting";
import { LayoutEngine, type LayoutMode } from "./layout/layoutEngine";
import { clampCloudSpacing, clampNodeSpacing } from "./layout/layoutTunables";
import type { ProjectionMode } from "./layout/projections";
import { draw } from "./rendering/drawOrchestrator";
import { drawSearchPulse } from "./rendering/drawSearchPulse";
import { loadRelationEdges as loadRelationEdgesPure } from "./relationEdges";
import { findNodesByQuery } from "./search";
import { runSynthesis } from "./synthesis";
import { getVectorStore } from "../../sync/storeFactory";
import { resolveEmbeddingTarget } from "../../sync/embeddingTarget";
import { getStoredNodePositions, saveNodePositions } from "../../sync/sqlite/nodePositions";
import { PositionPersister } from "./positionPersistence";
import { buildToolbar, type ToolbarHandles } from "./toolbar/toolbar";
import { filterVisibleNodes, isPlaced, isRelationNode, placeNode, type RelationEdge, type ScatterNode } from "./types";
import { buildScatterNode, cachedFrontmatterType, fileRefFromPath, isInScanScope, scanVaultNotes as scanVaultNotesPure, type ScanScope } from "./vaultScan";
import { VaultEventQueue, type PendingVaultChanges, type VaultNoteChange } from "./vaultEventQueue";
import { shouldIncludeFile } from "../../vaultFilter";
import { isRelationNote } from "../../relationNotes";

const SEARCH_PULSE_DURATION_MS = 1800;

export interface VectorScatterHost {
  app: App;
  settings: MemVectorSettings;
  saveSettings(): Promise<void>;
  focusSidebarNote(file: TFile): void;
  /** Re-applies settings to every open 2D view (MemVectorPlugin.applySettingsToOpenViews). */
  applySettingsToOpenViews?(options?: OpenViewSettingsChange): void;
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
   * domain, WikiLinks as relations, spacing) take effect through applyLayout, which does nothing when no
   * layout input changed; changed indexing exclusions (`rescan`) queue a rescan of the node set.
   */
  applyExternalSettingsChange(options?: OpenViewSettingsChange): void {
    // A hidden view only remembers that settings changed; it applies them once when it is shown again.
    if (!this.isVisible()) {
      this.deferSettingsChange(options);
      return;
    }
    if (options?.embeddings) this.reloadEmbeddings();
    // Exclusions decide which notes are nodes at all; the queued scan is debounced because the field saves per keystroke.
    if (options?.rescan) this.triggerVaultRescan();
    // Spacing can change in another open view's toolbar; the layout engine notices the new value as a layout input.
    const nodeSpacing = clampNodeSpacing(this.settings.scatterNodeSpacing ?? this.nodeSpacing);
    const cloudSpacing = clampCloudSpacing(this.settings.scatterCloudSpacing ?? this.cloudSpacing);
    if (nodeSpacing !== this.nodeSpacing || cloudSpacing !== this.cloudSpacing) {
      this.nodeSpacing = nodeSpacing;
      this.cloudSpacing = cloudSpacing;
      this.toolbarHandles?.updateSpacing?.(nodeSpacing, cloudSpacing);
    }
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
  /**
   * Writes moved positions in batches. Gated by positionsHydrated so a failed hydration never lets computed positions
   * overwrite valid stored ones (Issue #184).
   */
  private readonly positionWriter = new PositionPersister({
    write: (records) => saveNodePositions(this.app, records),
    source: () => ({ nodes: this.nodes, enabled: this.positionsHydrated && !this.embeddingHydrationFailed }),
    isStorable: (record) => {
      const file = record.path ? this.app.vault.getAbstractFileByPath(record.path) : null;
      return file instanceof TFile && shouldIncludeFile(file, this.settings.vectorSearchExclusions);
    },
  });
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

  /** Lets the other open 2D views pick up a setting this view's toolbar just changed (e.g. spacing). */
  notifyOpenViews(): void {
    this.host.applySettingsToOpenViews?.();
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
      viewFilterQuery: this.viewFilterQuery,
    };
  }

  /**
   * Purpose: Restores canvas viewport camera state and view preferences from Obsidian workspace on startup.
   */
  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    if (state && typeof state === "object") {
      const s = state as { pan?: PanState; zoom?: number; viewFilterQuery?: string };
      if (s.pan && typeof s.pan.x === "number" && typeof s.pan.y === "number") {
        this.pan = { x: s.pan.x, y: s.pan.y };
      }
      if (typeof s.zoom === "number" && !Number.isNaN(s.zoom)) {
        this.zoom = s.zoom;
      }
      // Legacy workspace edgeHops snapshots must never override plugin settings.
      this.edgeHops = this.settings.scatterEdgeHops ?? 1;
      this.toolbarHandles?.updateEdgeHops?.(this.edgeHops);
      if (typeof s.viewFilterQuery === "string" && s.viewFilterQuery !== this.viewFilterQuery) {
        this.viewFilterQuery = s.viewFilterQuery;
        this.toolbarHandles?.updateFilterQuery?.(this.viewFilterQuery);
        if (this.toolbarHandles) {
          await this.scanVaultNotes(undefined, { preserveView: true });
          this.toolbarHandles.updateSelectionUI();
        }
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

    this.nodeSpacing = clampNodeSpacing(this.settings.scatterNodeSpacing ?? 350);
    this.cloudSpacing = clampCloudSpacing(this.settings.scatterCloudSpacing ?? 800);
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
    this.registerVisibilityWatchers();
  }

  onClose(): Promise<void> {
    this.vaultEvents.dispose();
    void this.positionWriter.flush();
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

  private readonly vaultEvents = new VaultEventQueue(() => this.processVaultChanges());
  /** Serializes every update of the node list, so an older scan can never finish after - and overwrite - a newer one. */
  private workChain: Promise<void> = Promise.resolve();
  /** Incremented per requested full scan; work started under an older value is discarded. */
  private scanGeneration = 0;
  /** Vault changes arrived while the view was hidden and are waiting in the queue. */
  private staleWhileHidden = false;
  /** The last vector read failed: layout and position writes are frozen until a complete read succeeds (#191). */
  private embeddingHydrationFailed = false;
  /** Embedding fingerprint the in-memory node vectors were loaded for; null before the first complete read. */
  private embeddingsFingerprint: string | null = null;
  /** Settings changes that arrived while the view was hidden, merged; null when none are pending. */
  private deferredSettings: OpenViewSettingsChange | null = null;

  /**
   * Purpose: Registers reactive vault event watchers that feed the view's event queue.
   * Architecture: Only events that can change the view are queued: notes that are shown, or that the scan scope
   * (indexing exclusions, view filter, relation-note visibility) would show - a rename counts if either its old or
   * its new path qualifies. Relation notes and the vocabulary file always reload the edges, even outside the view
   * filter, because they change forces between shown notes; a relation note is additionally a node when relation
   * notes are shown. Relation notes are recognized by frontmatter, the relations folder, or - for deletes and the
   * old path of a rename, where no frontmatter is left - by the paths of the loaded relation edges.
   */
  registerVaultWatchers(): void {
    if (!this.app?.vault?.on) return;

    const isVocabulary = (p?: string) => Boolean(p && p === resolveVocabularyPath(this.settings));
    const fmType = (file: { path: string }) => (file instanceof TFile ? cachedFrontmatterType(this.app, file) : undefined);
    // A deleted file has no frontmatter left, so a relation note outside the relations folder is only recognizable
    // by the paths of the relation edges loaded from it.
    const isRel = (path: string, type?: string) =>
      isRelationNote(path, type, relationsFolder(this.settings)) || this.relationEdges.some((e) => e.path === path);
    const isMd = (p?: string) => Boolean(p && p.endsWith(".md"));
    const isShown = (path: string) => this.nodes.some((n) => n.path === path);
    const inScope = (path: string, type?: string) => isInScanScope(fileRefFromPath(path), type, this.scanScope());

    const handleFileEvent = (file: { path: string }, kind: "create" | "modify" | "delete") => {
      if (!file?.path) return;
      if (isVocabulary(file.path)) {
        this.triggerRelationsReload();
        return;
      }
      if (!isMd(file.path)) return;
      const type = kind === "delete" ? undefined : fmType(file);
      if (isRel(file.path, type)) this.triggerRelationsReload();
      if (kind === "delete") {
        if (isShown(file.path)) this.triggerVaultRescan({ kind: "delete", path: file.path });
      } else if (isShown(file.path) || inScope(file.path, type)) {
        this.triggerVaultRescan({ kind: "upsert", path: file.path });
      }
    };

    const handleRenameEvent = (file: { path: string }, oldPath: string) => {
      if (isVocabulary(file?.path) || isVocabulary(oldPath)) {
        this.triggerRelationsReload();
        return;
      }
      if (!isMd(file?.path) && !isMd(oldPath)) return;
      const type = fmType(file);
      if (isRel(file.path, type) || isRel(oldPath)) this.triggerRelationsReload();
      if (isShown(oldPath) || inScope(file.path, type)) {
        this.triggerVaultRescan({ kind: "rename", path: file.path, oldPath });
      }
    };

    this.registerEvent(this.app.vault.on("create", (file) => handleFileEvent(file, "create")));
    this.registerEvent(this.app.vault.on("modify", (file) => handleFileEvent(file, "modify")));
    this.registerEvent(this.app.vault.on("delete", (file) => handleFileEvent(file, "delete")));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => handleRenameEvent(file, oldPath)));
  }

  /**
   * Purpose: Tells whether the view is currently on screen.
   * Architecture: Uses Obsidian's HTMLElement.isShown(), which is false when the view element or an ancestor is
   * hidden - a background tab - and true for a view in a split pane or a popout window, since it checks the element's
   * own DOM ancestry rather than the active leaf.
   */
  private isVisible(): boolean {
    const el = this.containerEl as HTMLElement & { isShown?: () => boolean };
    return typeof el.isShown === "function" ? el.isShown() : true;
  }

  /**
   * Purpose: Re-checks visibility whenever the workspace layout or the active leaf changes, so a view that collected
   * vault changes while hidden applies them once it is shown again.
   */
  registerVisibilityWatchers(): void {
    const workspace = this.app?.workspace;
    if (!workspace?.on) return;
    this.registerEvent(workspace.on("layout-change", () => this.resumeIfVisible()));
    this.registerEvent(workspace.on("active-leaf-change", () => this.resumeIfVisible()));
  }

  /** Remembers a settings change for a hidden view, merging it with earlier ones. */
  private deferSettingsChange(options?: OpenViewSettingsChange): void {
    const merged = this.deferredSettings ?? {};
    if (options?.relayout) merged.relayout = true;
    if (options?.embeddings) merged.embeddings = true;
    if (options?.rescan) merged.rescan = true;
    this.deferredSettings = merged;
    this.staleWhileHidden = true;
  }

  /** Applies the settings and vault changes collected while the view was hidden, once it is visible again. */
  private resumeIfVisible(): void {
    if (!this.staleWhileHidden || !this.isVisible()) return;
    this.staleWhileHidden = false;
    const settings = this.deferredSettings;
    this.deferredSettings = null;
    if (settings) this.applyExternalSettingsChange(settings);
    if (this.vaultEvents.hasPending()) this.processVaultChanges();
  }

  /** Queues a reload of relation edges and vocabulary forces. */
  triggerRelationsReload(): void {
    this.vaultEvents.relationsChanged();
  }

  /** Queues one note change, or a background full rescan when no change is given. */
  triggerVaultRescan(change?: VaultNoteChange): void {
    if (!change) this.vaultEvents.fullScanRequested();
    else if (change.kind === "rename") this.vaultEvents.noteRenamed(change.oldPath, change.path);
    else if (change.kind === "delete") this.vaultEvents.noteDeleted(change.path);
    else this.vaultEvents.noteChanged(change.path);
  }

  /** The scope the scan and incremental updates use to decide which notes are nodes. */
  private scanScope(): ScanScope {
    return {
      filterQuery: this.viewFilterQuery,
      exclusions: this.settings.vectorSearchExclusions,
      relationsDir: relationsFolder(this.settings),
      showRelationNotes: this.showRelationNotes,
    };
  }

  /** Runs `task` after every update queued before it. A failure is logged and does not block later updates. */
  private runExclusive(task: () => Promise<void>): Promise<void> {
    const run = this.workChain.then(task);
    this.workChain = run.catch(() => undefined);
    return run;
  }

  /**
   * Purpose: Applies the batch of queued vault changes.
   * Architecture: A queued full scan supersedes per-note changes. Otherwise only the changed notes are read; if that
   * fails, a full scan restores a consistent node list.
   */
  private processVaultChanges(): void {
    // A hidden view keeps collecting; nothing is read or laid out until it is shown again.
    if (!this.isVisible()) {
      this.staleWhileHidden = true;
      return;
    }
    const changes = this.vaultEvents.take();
    void this.runExclusive(async () => {
      try {
        // While vectors cannot be read, every update is a full scan, so the next one that can read them unfreezes the map.
        if (changes.fullScan || this.embeddingHydrationFailed) {
          await this.fullScan({ preserveView: true }, this.scanGeneration);
        } else if (changes.upserts.size > 0 || changes.removals.size > 0) {
          await this.applyNoteChanges(changes, this.scanGeneration);
        } else if (changes.relations) {
          await this.loadRelationEdges();
          this.applyLayout();
          this.redraw();
        }
        this.toolbarHandles?.updateSelectionUI();
      } catch (err) {
        console.warn("MemVector: Incremental 2D view update failed, falling back to a full rescan:", err);
        this.vaultEvents.fullScanRequested();
      }
    });
  }

  /**
   * Purpose: Re-reads only the changed notes and updates the node list in place.
   * Architecture: A modified or renamed note keeps its position and in-memory vector; a new note gets its stored
   * vector and stored position, if any, and is otherwise placed by the layout. The layout engine then decides from
   * the layout inputs whether anything has to move.
   */
  private async applyNoteChanges(changes: PendingVaultChanges, generation: number): Promise<void> {
    const scope = this.scanScope();
    const previousByPath = new Map(this.nodes.map((n) => [n.path, n]));
    const kept = this.nodes.filter((n) => !changes.removals.has(n.path) && !changes.upserts.has(n.path));
    const fresh: ScatterNode[] = [];

    for (const path of changes.upserts) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      if (!isInScanScope(file, cachedFrontmatterType(this.app, file), scope)) continue;
      const node = await buildScatterNode(this.app, file);
      const previous = previousByPath.get(path) ?? previousByPath.get(changes.renamedFrom.get(path) ?? "");
      if (previous) {
        node.embedding = previous.embedding;
        if (isPlaced(previous)) placeNode(node, previous.x, previous.y);
      }
      fresh.push(node);
    }

    const added = fresh.filter((n) => !previousByPath.has(n.path));
    await this.hydrateStoredEmbeddings(added.filter((n) => !n.embedding), new Map());
    await this.hydrateStoredPositions(added.filter((n) => !isPlaced(n)));
    if (changes.relations) await this.loadRelationEdges();
    if (generation !== this.scanGeneration) return;

    this.nodes = [...kept, ...fresh].sort((a, b) => a.path.localeCompare(b.path));
    this.reconcileTransientState();
    this.applyLayout();
    this.redraw();
  }

  private hasFittedView = false;

  private handleResize(): void {
    this.resumeIfVisible();
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
   * `preserveView` keeps the user's pan and zoom for background rescans. Every scan runs after the updates queued
   * before it; a scan superseded by a newer request is skipped, and pending per-note changes are dropped because the
   * full scan reads every note anyway.
   */
  scanVaultNotes(filterOverride?: string, options: { preserveView?: boolean } = {}): Promise<void> {
    if (filterOverride !== undefined) {
      this.viewFilterQuery = filterOverride;
      void this.app.workspace?.requestSaveLayout?.();
    }
    const generation = ++this.scanGeneration;
    this.vaultEvents.supersededByFullScan();
    return this.runExclusive(async () => {
      if (generation !== this.scanGeneration) return;
      await this.fullScan(options, generation);
    });
  }

  private async fullScan(options: { preserveView?: boolean }, generation: number): Promise<void> {
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
        if (isPlaced(node)) {
          previousPositions.set(node.path, { x: node.x, y: node.y });
          previousPositions.set(node.id, { x: node.x, y: node.y });
        }
      }
    }

    const scope = this.scanScope();
    const nodes = await scanVaultNotesPure(this.app, scope.filterQuery, scope.exclusions, scope.relationsDir, scope.showRelationNotes);

    for (const node of nodes) {
      const existingPos = previousPositions.get(node.path) ?? previousPositions.get(node.id);
      if (existingPos) placeNode(node, existingPos.x, existingPos.y);
    }

    // Both must be in place *before* the layout pass below, or it falls back to
    // text/link/folder heuristics for a session that already has a semantic
    // index and typed relations on disk.
    await this.hydrateStoredEmbeddings(nodes, previousEmbeddings, true);
    await this.hydrateStoredPositions(nodes, true);
    await this.loadRelationEdges();
    if (generation !== this.scanGeneration) return;

    this.nodes = nodes;
    this.reconcileTransientState();
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
      // Hidden since the request: reload once the view is shown again.
      if (!this.isVisible()) {
        this.deferSettingsChange({ embeddings: true });
        return;
      }
      void this.runExclusive(async () => {
        for (const n of this.nodes) n.embedding = undefined;
        await this.hydrateStoredEmbeddings(this.nodes, new Map(), true);
        this.applyLayout();
        this.redraw();
      });
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
   * scoped to the active embedding model. When it cannot be read, the in-memory vectors of the previous scan
   * (`fallback`) are only used if they belong to the current embedding fingerprint, and layout and position writes
   * stay frozen until a complete read (`full`) succeeds again, so fallback data never rearranges or overwrites the
   * map. Returns false on a failed read.
   */
  private async hydrateStoredEmbeddings(nodes: ScatterNode[], fallback: Map<string, number[]>, full = false): Promise<boolean> {
    const fingerprint = resolveEmbeddingTarget(this.settings).fingerprint;
    if (nodes.length === 0) {
      if (full) this.markEmbeddingsHydrated(fingerprint);
      return true;
    }
    let stored: Map<string, number[]>;
    try {
      const store = getVectorStore(this.app, this.settings);
      stored = await store.getVectors([...nodes.map((n) => n.path), ...nodes.map((n) => n.id)]);
    } catch (err) {
      this.markEmbeddingHydrationFailed(err);
      // In-memory vectors only stand in when they belong to the current model; otherwise none are better than foreign ones.
      if (this.embeddingsFingerprint === fingerprint) {
        for (const n of nodes) {
          const v = fallback.get(n.path) ?? fallback.get(n.id);
          if (v) n.embedding = v;
        }
      }
      return false;
    }
    for (const n of nodes) {
      const v = stored.get(n.path) ?? stored.get(n.id);
      if (v) n.embedding = v;
    }
    if (full) this.markEmbeddingsHydrated(fingerprint);
    return true;
  }

  /** Records a failed vector read: the map is frozen and the user is told once per failure period (Issue #191). */
  private markEmbeddingHydrationFailed(err: unknown): void {
    console.error("MemVector: Failed to load stored vectors; keeping the 2D map unchanged until they can be read:", err);
    if (!this.embeddingHydrationFailed) {
      const t = getTranslation(this.settings.language || "de");
      new Notice(`[ERROR] ${t.noticeEmbeddingHydrationFailed}`, 8000);
    }
    this.embeddingHydrationFailed = true;
  }

  /** A complete, successful vector read: layout updates resume and the in-memory vectors belong to `fingerprint`. */
  private markEmbeddingsHydrated(fingerprint: string): void {
    this.embeddingHydrationFailed = false;
    this.embeddingsFingerprint = fingerprint;
  }

  /**
   * Purpose: Loads the persisted 2D coordinates of unplaced nodes from SQLite.
   * Architecture: Preserves the user's mental map across restarts (ADR-0006). Fails safe by gating position
   * persistence so transient read errors never overwrite stored coordinates (Issue #184). A full scan (`full`)
   * re-opens the gate on success; an incremental update for a few new notes can only close it.
   */
  private async hydrateStoredPositions(nodes: ScatterNode[], full = false): Promise<void> {
    if (nodes.length === 0) {
      if (full) this.positionsHydrated = true;
      return;
    }
    try {
      const queryKeys = [...nodes.map((n) => n.path), ...nodes.map((n) => n.id)];
      const stored = await getStoredNodePositions(this.app, queryKeys);
      const inStorage: { id: string; x: number; y: number }[] = [];
      nodes.forEach((n) => {
        const pos = stored.get(n.id) ?? stored.get(n.path);
        if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) inStorage.push({ id: n.id, x: pos.x, y: pos.y });
      });
      this.positionWriter.markPersisted(inStorage);
      nodes.forEach((n) => {
        if (!isPlaced(n)) {
          const pos = stored.get(n.id) ?? stored.get(n.path);
          if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) placeNode(n, pos.x, pos.y);
        }
      });
      if (full) this.positionsHydrated = true;
    } catch (err) {
      this.positionsHydrated = false;
      console.warn("MemVector: Failed to hydrate stored node positions, aborting position persistence to protect mental map:", err);
    }
  }

  /**
   * Purpose: Lays out the nodes when a layout input changed, and persists positions only when the simulation ran.
   * Architecture: Data updates call this with "auto"; the layout engine compares the layout-input signatures with the
   * last completed pass and leaves every node in place when nothing relevant changed (ADR-0006).
   */
  applyLayout(mode: LayoutMode = "auto"): void {
    // Vectors could not be read: laying out on fallback data would rearrange and overwrite the existing map (#191).
    if (this.embeddingHydrationFailed) return;
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
    if (simulated) this.positionWriter.schedule();
  }

  /**
   * Purpose: Runs a free layout from scratch - the explicit rearrangement (ADR-0006) - and fits the camera to it.
   * Architecture: Data updates only adjust the layout locally, so this is the one way to get a fresh global
   * arrangement; it also recomputes the similarity scale and the clusters. Queued after any running update.
   */
  rearrangeLayout(): Promise<void> {
    return this.runExclusive(async () => {
      this.applyLayout("rearrange");
      this.fitToView();
      this.hasFittedView = true;
      this.redraw();
    });
  }

  /**
   * Purpose: Picks up the vectors a successful "Calculate vectors" run just stored, then updates the layout.
   * Architecture: A complete read from the store - not the run's in-memory vectors - is what proves the vectors are
   * readable again, so it also lifts the layout freeze after a failed read and records the fingerprint (#191).
   */
  onVectorsCalculated(): Promise<void> {
    return this.runExclusive(async () => {
      await this.hydrateStoredEmbeddings(this.nodes, new Map(), true);
      this.applyLayout();
      this.redraw();
    });
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
    void this.runExclusive(async () => {
      await this.loadRelationEdges();
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
