import { ItemView, TFile, type App, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { getTranslation } from "../../i18n";
import { RelationBuilderModal, type RelationChange } from "../../modals/relationBuilder/RelationBuilderModal";
import { loadRelationVocabulary } from "../../relationVocabulary/loadRelationVocabulary";
import { relationsFolder } from "../../vaultLayout";
import { DEFAULT_RELATION_VOCABULARY } from "../../relationVocabulary/defaultVocabulary";
import type { RelationTermDef } from "../../relationVocabulary/types";
import type { MemVectorSettings, OpenViewSettingsChange } from "../../settings/types";
import { MATH_VECTOR_SCATTER_VIEW_TYPE } from "../../constants";
import { wireCanvasInteraction } from "./canvasInteraction";
import { createInteractionState, type ScatterViewContext } from "./context";
import { hitTest as hitTestPure, hitTestEdge as hitTestEdgePure, type PanState } from "./hitTesting";
import { LayoutEngine, type LayoutMode } from "./layout/layoutEngine";
import { clampCloudSpacing, clampNodeSpacing } from "./layout/layoutTunables";
import type { ProjectionMode } from "./layout/projections";
import { draw } from "./rendering/drawOrchestrator";
import { drawSearchPulse } from "./rendering/drawSearchPulse";
import { loadRelationEdges as loadRelationEdgesPure } from "./relationEdges";
import { confirmedEdges } from "../../frontmatterLinks";
import { SearchController } from "./searchController";
import { runSynthesis } from "./synthesis";
import { saveNodePositions } from "../../sync/sqlite/nodePositions";
import { PositionPersister } from "./positionPersistence";
import { NodeHydration } from "./nodeHydration";
import { buildToolbar, type ToolbarHandles } from "./toolbar/toolbar";
import { filterVisibleNodes, isPlaced, isRelationNode, placeNode, type RelationEdge, type ScatterNode } from "./types";
import { buildScatterNode, cachedFrontmatterType, fileRefFromPath, isInScanScope, scanVaultNotes as scanVaultNotesPure, type ScanScope } from "./vaultScan";
import { registerScatterVaultWatchers } from "./vaultWatchers";
import { VaultEventQueue, type PendingVaultChanges, type VaultNoteChange } from "./vaultEventQueue";
import { shouldIncludeFile } from "../../vaultFilter";
import type { VaultIndexingPipeline } from "../../sync/vaultIndexPipeline";

export interface VectorScatterHost {
  app: App;
  settings: MemVectorSettings;
  saveSettings(): Promise<void>;
  focusSidebarNote(file: TFile): void;
  /** Re-applies settings to every open 2D view (MemVectorPlugin.applySettingsToOpenViews). */
  applySettingsToOpenViews?(options?: OpenViewSettingsChange): void;
  vaultIndexer?: VaultIndexingPipeline | null;
}

export interface NodePositionProvider {
  getNodePosition(path: string): { x: number; y: number } | null;
}

/**
 * Purpose: Layout mode after a relation change in the relation builder.
 * Architecture: Every change, including a delete, is a bounded adjustment around the endpoints (Plan 0005 S1); a
 * global rearrangement happens only through "Layout neu anordnen".
 */
export function relationChangeLayoutMode(_change: RelationChange): LayoutMode {
  return "relations";
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
    const shown = filterVisibleNodes(this.nodes, this.showRelationNotes, relationsFolder(this.settings));
    // The filter only hides notes; they stay in the layout (Plan 0005 S2).
    if (!this.viewFilterQuery.trim()) return shown;
    return shown.filter((n) => shouldIncludeFile(fileRefFromPath(n.path), this.viewFilterQuery));
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

      this.search.resetMatches();

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
  readonly interaction = createInteractionState();
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

  // Accessors, not values: the constructor sets `app` after the field initializers ran
  private readonly hydration = new NodeHydration({
    app: () => this.app,
    settings: () => this.settings,
    markPositionsPersisted: (positions) => this.positionWriter.markPersisted(positions),
  });
  private get positionsHydrated(): boolean {
    return this.hydration.positionsHydrated;
  }
  private set positionsHydrated(value: boolean) {
    this.hydration.positionsHydrated = value;
  }
  private get embeddingHydrationFailed(): boolean {
    return this.hydration.embeddingHydrationFailed;
  }
  private set embeddingHydrationFailed(value: boolean) {
    this.hydration.embeddingHydrationFailed = value;
  }
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
  private readonly search = new SearchController({
    visibleNodes: () => this.getVisibleNodes(),
    viewportSize: () => ({ width: this.canvasWrap.clientWidth, height: this.canvasWrap.clientHeight }),
    pan: () => this.pan,
    zoom: () => this.zoom,
    redraw: () => this.redraw(),
    win: () => this.containerEl.win,
    settings: () => this.settings,
  });
  private get searchHighlight(): { nodeId: string; startedAt: number } | null {
    return this.search.highlight;
  }
  private set searchHighlight(value: { nodeId: string; startedAt: number } | null) {
    this.search.highlight = value;
  }

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
        if (this.toolbarHandles && !this.initialScanPending) {
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

    this.initialScanPending = true;
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
      if (!this.initialScanPending) return;
      this.initialScanPending = false;
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

    if (this.host.vaultIndexer) {
      this.unsubscribeIndexer = this.host.vaultIndexer.subscribe((changes) => {
        this.processVaultChanges(changes);
      });
    } else {
      this.registerVaultWatchers();
    }
    this.registerVisibilityWatchers();
    this.registerLinkResolutionWatcher();
  }

  onClose(): Promise<void> {
    this.initialScanPending = false;
    this.unsubscribeIndexer?.();
    this.unsubscribeIndexer = null;
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

  private unsubscribeIndexer: (() => void) | null = null;
  private readonly vaultEvents = new VaultEventQueue(() => this.processVaultChanges());
  /** Serializes every update of the node list, so an older scan can never finish after - and overwrite - a newer one. */
  private workChain: Promise<void> = Promise.resolve();
  /** Incremented per requested full scan; work started under an older value is discarded. */
  private scanGeneration = 0;
  /** Workspace restoration can change the filter before the layout-ready scan starts. */
  private initialScanPending = false;
  /** Vault changes arrived while the view was hidden and are waiting in the queue. */
  private staleWhileHidden = false;
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
    registerScatterVaultWatchers({
      app: this.app,
      settings: () => this.settings,
      nodes: () => this.nodes,
      relationEdges: () => this.relationEdges,
      vocabulary: () => this.vocabulary,
      scanScope: () => this.scanScope(),
      triggerRelationsReload: () => this.triggerRelationsReload(),
      triggerVaultRescan: (change) => this.triggerVaultRescan(change),
      registerEvent: (ref) => this.registerEvent(ref),
    });
  }

  /**
   * Purpose: Re-lays out when Obsidian has resolved links again (Plan 0005: resolved WikiLinks are the link signal's
   * source). Registered on every view, also when the plugin's indexer replaces the vault watchers.
   */
  registerLinkResolutionWatcher(): void {
    // Also after a link target was created or renamed; nothing moves unless a link of a laid-out note changed.
    const metadataCache = this.app.metadataCache as (typeof this.app.metadataCache & { on?: unknown }) | undefined;
    if (metadataCache && typeof metadataCache.on === "function") {
      this.registerEvent(
        this.app.metadataCache.on("resolved", () => {
          if (this.linksResolvedTimer !== null) window.clearTimeout(this.linksResolvedTimer);
          this.linksResolvedTimer = window.setTimeout(() => {
            this.linksResolvedTimer = null;
            if (this.nodes.length === 0) return;
            // A hidden view re-lays out once it is shown again (resumeIfVisible applies deferred settings).
            if (!this.isVisible()) {
              this.deferSettingsChange();
              return;
            }
            void this.runExclusive(async () => {
              this.applyLayout();
              this.redraw();
            });
          }, 500);
        })
      );
    }
  }

  private linksResolvedTimer: number | null = null;

  /**
   * Resolved WikiLink targets of the laid-out notes: the links in the note text (metadata cache `links`), resolved by
   * Obsidian (`getFirstLinkpathDest`). Frontmatter links are left out: confirmed ones are typed relations and
   * `_suggested` ones must not pull (#243), so neither counts twice or unconfirmed (Plan 0005 review).
   */
  private resolvedLinks(): Map<string, string[]> {
    const cache = this.app.metadataCache;
    const links = new Map<string, string[]>();
    if (!cache?.getFileCache || !cache.getFirstLinkpathDest) return links;
    for (const node of this.nodes) {
      const file = this.app.vault.getAbstractFileByPath(node.path);
      if (!(file instanceof TFile)) continue;
      const targets = new Set<string>();
      for (const link of cache.getFileCache(file)?.links ?? []) {
        const linkpath = link.link.split("#")[0].trim();
        if (!linkpath) continue;
        const dest = cache.getFirstLinkpathDest(linkpath, node.path);
        if (dest && dest.path !== node.path) targets.add(dest.path);
      }
      if (targets.size > 0) links.set(node.path, [...targets]);
    }
    return links;
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
    if (this.host.vaultIndexer) {
      this.host.vaultIndexer.triggerRelationsReload();
    } else {
      this.vaultEvents.relationsChanged();
    }
  }

  /** Queues one note change, or a background full rescan when no change is given. */
  triggerVaultRescan(change?: VaultNoteChange): void {
    if (this.host.vaultIndexer) {
      this.host.vaultIndexer.triggerVaultRescan(change);
    } else {
      if (!change) this.vaultEvents.fullScanRequested();
      else if (change.kind === "rename") this.vaultEvents.noteRenamed(change.oldPath, change.path);
      else if (change.kind === "delete") this.vaultEvents.noteDeleted(change.path);
      else this.vaultEvents.noteChanged(change.path);
    }
  }

  /**
   * The scope the scan and incremental updates use to decide which notes are nodes. The view filter is not part of
   * it: it only hides notes (getVisibleNodes), so changing it never moves the map (Plan 0005 S2).
   */
  private scanScope(): ScanScope {
    return {
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

  private mergeChangesIntoQueue(changes: PendingVaultChanges): void {
    if (changes.fullScan) this.vaultEvents.fullScanRequested();
    if (changes.relations) this.vaultEvents.relationsChanged();
    const renamedOld = new Set(changes.renamedFrom.values());
    for (const [newPath, oldPath] of changes.renamedFrom.entries()) {
      this.vaultEvents.noteRenamed(oldPath, newPath);
    }
    for (const path of changes.upserts) {
      if (!changes.renamedFrom.has(path) || changes.modified?.has(path)) {
        this.vaultEvents.noteChanged(path);
      }
    }
    for (const path of changes.removals) {
      if (!renamedOld.has(path)) {
        this.vaultEvents.noteDeleted(path);
      }
    }
  }

  /**
   * Purpose: Applies the batch of queued vault changes.
   * Architecture: A queued full scan supersedes per-note changes. Otherwise only the changed notes are read; if that
   * fails, a full scan restores a consistent node list.
   */
  private processVaultChanges(incomingChanges?: PendingVaultChanges): void {
    if (incomingChanges) {
      this.mergeChangesIntoQueue(incomingChanges);
    }
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

    const needsEmbeddingHydration: ScatterNode[] = [];
    const fallback = new Map<string, number[]>();

    for (const node of fresh) {
      const isRename = changes.renamedFrom.has(node.path);
      const wasModified = changes.modified?.has(node.path);
      if ((!isRename || wasModified) && this.settings.autoIndexVaultOnChanges) {
        if (node.embedding) fallback.set(node.path, node.embedding);
        needsEmbeddingHydration.push(node);
      } else if (!node.embedding) {
        needsEmbeddingHydration.push(node);
      }
    }

    if (needsEmbeddingHydration.length > 0) {
      await this.hydrateStoredEmbeddings(needsEmbeddingHydration, fallback);
    }

    const unplaced = fresh.filter((n) => !isPlaced(n));
    if (unplaced.length > 0) {
      await this.hydrateStoredPositions(unplaced);
    }
    if (changes.relations) await this.loadRelationEdges();
    if (generation !== this.scanGeneration) return;

    this.nodes = [...kept, ...fresh].sort((a, b) => a.path.localeCompare(b.path, "en"));
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
      isDraggingLasso: this.interaction.isDraggingLasso,
      lassoPath: this.interaction.lassoPath,
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
        this.pruneDeletedNodes();
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
    this.search.resetMatches();
  }



  /** Loads stored vectors into `nodes` (see NodeHydration.embeddings); false on a failed read. */
  private hydrateStoredEmbeddings(nodes: ScatterNode[], fallback: Map<string, number[]>, full = false): Promise<boolean> {
    return this.hydration.embeddings(nodes, fallback, full);
  }

  /** Loads stored positions of unplaced nodes (see NodeHydration.positions). */
  private hydrateStoredPositions(nodes: ScatterNode[], full = false): Promise<void> {
    return this.hydration.positions(nodes, full);
  }

  /**
   * Purpose: Drops nodes whose backing files no longer exist before layout or embedding updates.
   * Architecture: Prevents stale ghost notes from participating in force simulations or distorting free layouts
   * when vault deletion events are still queued behind the current view action.
   */
  pruneDeletedNodes(): boolean {
    if (!this.app?.vault?.getAbstractFileByPath) return false;
    const existing = this.nodes.filter((n) => this.app.vault.getAbstractFileByPath(n.path) instanceof TFile);
    if (existing.length !== this.nodes.length) {
      this.nodes = existing;
      this.reconcileTransientState();
      return true;
    }
    return false;
  }

  /**
   * Purpose: Lays out the nodes when a layout input changed, and persists positions only when the simulation ran.
   * Architecture: Data updates call this with "auto"; the layout engine compares the layout-input signatures with the
   * last completed pass and leaves every node in place when nothing relevant changed (ADR-0006).
   */
  applyLayout(mode: LayoutMode = "auto"): void {
    // Vectors could not be read: laying out on fallback data would rearrange and overwrite the existing map (#191).
    if (this.embeddingHydrationFailed) return;
    this.pruneDeletedNodes();
    const { moved } = this.layoutEngine.run(
      {
        nodes: this.nodes,
        // Unconfirmed suggestions are drawn but do not pull notes together (#243).
        relationEdges: confirmedEdges(this.relationEdges),
        vocabulary: this.vocabulary,
        links: this.resolvedLinks(),
        settings: this.settings,
        nodeSpacing: this.nodeSpacing,
        cloudSpacing: this.cloudSpacing,
      },
      mode
    );
    // Positions also change without a simulation when node spacing scales the map (Plan 0005 S4).
    if (moved) this.positionWriter.schedule();
  }

  /**
   * Purpose: Runs a free layout from scratch - the explicit rearrangement (ADR-0006) - and fits the camera to it.
   * Architecture: Data updates only adjust the layout locally, so this is the one way to get a fresh global
   * arrangement; it also recomputes the similarity scale and the clusters. Queued after any running update.
   */
  rearrangeLayout(): Promise<void> {
    return this.runExclusive(async () => {
      this.pruneDeletedNodes();
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
      this.pruneDeletedNodes();
      await this.hydrateStoredEmbeddings(this.nodes, new Map(), true);
      this.applyLayout();
      this.redraw();
    });
  }

  async loadRelationEdges(): Promise<void> {
    // Per-label attraction/repulsion comes from the vault's own vocabulary
    // file (ADR-0002); refresh it together with the edges so saved custom
    // types feed the force layout immediately. Its labels also name the
    // frontmatter typed-link keys (#243), so it is loaded first.
    this.vocabulary = await loadRelationVocabulary(this.app, this.settings);
    this.relationEdges = await loadRelationEdgesPure(
      this.app,
      this.settings.vectorSearchExclusions,
      relationsFolder(this.settings),
      this.vocabulary.map((t) => t.label)
    );
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

  refreshRelationEdges(mode: LayoutMode = "auto"): void {
    // Also re-run layout, not just re-render edges - a saved/edited/deleted
    // relation must feed the force layout's topology weights too, not only
    // the drawn edge lines.
    void this.runExclusive(async () => {
      await this.loadRelationEdges();
      this.pruneDeletedNodes();
      this.applyLayout(mode);
      if (mode === "rearrange") {
        this.fitToView();
        this.hasFittedView = true;
      }
      this.redraw();
    });
  }

  openRelationBuilder(selected: ScatterNode[]): void {
    new RelationBuilderModal(this.app, this, selected, undefined, (change) => this.refreshRelationEdges(relationChangeLayoutMode(change))).open();
  }

  /**
   * Purpose: Opens the relation builder modal pre-filled with an existing edge's metadata for editing or deletion.
   */
  editRelationEdge(edge: RelationEdge): void {
    // A frontmatter link lives in an ordinary note, not a relation note: open that note instead of the relation
    // builder, which would rewrite or delete the file as if it were a relation note (#243).
    if (edge.origin === "frontmatter") {
      void this.app.workspace.openLinkText(edge.path, "", false);
      return;
    }
    const srcNode = this.nodes.find((n) => n.id.toLowerCase() === edge.srcId.toLowerCase());
    const tgtNode = this.nodes.find((n) => n.id.toLowerCase() === edge.tgtId.toLowerCase());
    if (!srcNode || !tgtNode) return;
    new RelationBuilderModal(
      this.app,
      this,
      [srcNode, tgtNode],
      { relType: edge.relType, description: edge.desc, path: edge.path, srcId: edge.srcId, tgtId: edge.tgtId },
      (change) => this.refreshRelationEdges(relationChangeLayoutMode(change))
    ).open();
  }

  /** Repeated Enter on the same query cycles through every match (see SearchController.search). */
  searchNote(query: string): void {
    this.search.search(query);
  }

  /** Cancels a pending pulse frame against the window that issued it. */
  private cancelSearchAnim(): void {
    this.search.cancelPulse();
  }

  async runSynthesis(setHoverText: (text: string) => void, customQuestion?: string, excludedContextIds?: ReadonlySet<string>): Promise<void> {
    const selected = this.nodes.filter((n) => this.selectedNodeIds.has(n.id));
    await runSynthesis(this.app, this.settings, selected, setHoverText, customQuestion, excludedContextIds);
  }
}
