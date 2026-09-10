import { Notice, ItemView, TFile, type App, type WorkspaceLeaf } from "obsidian";
import { getTranslation } from "../../i18n";
import { RelationBuilderModal } from "../../modals/relationBuilder/RelationBuilderModal";
import type { MemVectorSettings } from "../../settings/types";
import { MATH_VECTOR_SCATTER_VIEW_TYPE } from "../../constants";
import { wireCanvasInteraction } from "./canvasInteraction";
import type { ScatterViewContext } from "./context";
import { hitTest as hitTestPure, hitTestEdge as hitTestEdgePure } from "./hitTesting";
import { applyVectorLayout } from "./layout/applyVectorLayout";
import type { ProjectionMode } from "./layout/projections";
import { draw } from "./rendering/drawOrchestrator";
import { drawSearchPulse } from "./rendering/drawSearchPulse";
import { loadRelationEdges as loadRelationEdgesPure } from "./relationEdges";
import { findNodesByQuery } from "./search";
import { runSynthesis } from "./synthesis";
import { buildToolbar, type ToolbarHandles } from "./toolbar/toolbar";
import type { RelationEdge, ScatterNode } from "./types";
import { scanVaultNotes as scanVaultNotesPure } from "./vaultScan";

const SEARCH_PULSE_DURATION_MS = 1800;

export interface VectorScatterHost {
  app: App;
  settings: MemVectorSettings;
  saveSettings(): Promise<void>;
  focusSidebarNote(file: TFile): void;
}

export class VectorScatterView extends ItemView implements ScatterViewContext {
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
  showEdges = false;
  edgeHops = 1;
  relationEdges: RelationEdge[] = [];
  nodeSpacing = 350;
  cloudSpacing = 800;
  projectionMode: ProjectionMode = "graphvector";

  private canvas!: HTMLCanvasElement;
  private canvasCtx!: CanvasRenderingContext2D;
  private canvasWrap!: HTMLElement;
  private resizeObserver: ResizeObserver | null = null;
  private interactionCleanup: (() => void) | null = null;
  private toolbarHandles: ToolbarHandles | null = null;
  private searchHighlight: { nodeId: string; startedAt: number } | null = null;
  private searchAnimHandle: number | null = null;
  private lastSearchQuery: string | null = null;
  private lastSearchMatches: ScatterNode[] = [];
  private lastSearchIndex = -1;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly host: VectorScatterHost
  ) {
    super(leaf);
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

  async onOpen(): Promise<void> {
    this.containerEl.style.position = "relative";
    const container = (this.containerEl.children[1] as HTMLElement | undefined) || this.containerEl;
    container.empty();
    container.addClass("math-vector-scatter-container");
    Object.assign(container.style, {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      width: "100%",
      background: "var(--background-primary)",
      position: "relative",
      overflow: "hidden",
    });

    const canvasWrap = container.createEl("div");
    Object.assign(canvasWrap.style, { flex: "1", position: "relative", width: "100%", height: "100%", overflow: "hidden" });
    this.canvasWrap = canvasWrap;

    const canvas = canvasWrap.createEl("canvas");
    Object.assign(canvas.style, { width: "100%", height: "100%", display: "block", cursor: "grab" });
    this.canvas = canvas;
    const canvasCtx = canvas.getContext("2d");
    if (!canvasCtx) return;
    this.canvasCtx = canvasCtx;

    const toolbarEl = canvasWrap.createEl("div");
    Object.assign(toolbarEl.style, {
      position: "absolute",
      top: "12px",
      right: "12px",
      zIndex: "20",
      display: "flex",
      flexDirection: "column",
      width: "220px",
      borderRadius: "12px",
      background: "var(--background-secondary-alt, var(--background-secondary, rgba(15, 23, 42, 0.88)))",
      backdropFilter: "blur(20px)",
      border: "1px solid var(--background-modifier-border, var(--border-color, rgba(255,255,255,0.08)))",
      boxShadow: "0 8px 24px var(--background-modifier-box-shadow, rgba(0,0,0,0.3))",
      overflow: "hidden",
      transition: "opacity 0.2s ease, transform 0.2s ease",
    });

    this.addAction("sliders", "Werkzeugleiste ein/ausblenden", () => {
      const isVisible = toolbarEl.style.opacity !== "0";
      toolbarEl.style.opacity = isVisible ? "0" : "1";
      toolbarEl.style.pointerEvents = isVisible ? "none" : "auto";
      toolbarEl.style.transform = isVisible ? "translateY(-6px) scale(0.97)" : "translateY(0) scale(1)";
    });

    const hoverBar = container.createEl("div");
    Object.assign(hoverBar.style, {
      padding: "6px 12px",
      borderTop: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
      background: "var(--background-secondary, rgba(15, 23, 42, 0.9))",
      fontSize: "0.85em",
      color: "var(--text-muted)",
      zIndex: "10",
    });

    this.nodeSpacing = this.settings.scatterNodeSpacing ?? 350;
    this.cloudSpacing = this.settings.scatterCloudSpacing ?? 800;

    const t = getTranslation(this.settings.language || "de");
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

    await this.scanVaultNotes();
    this.toolbarHandles.updateSelectionUI();
  }

  onClose(): Promise<void> {
    this.interactionCleanup?.();
    this.interactionCleanup = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.searchAnimHandle !== null) cancelAnimationFrame(this.searchAnimHandle);
    return Promise.resolve();
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

  fitToView(): void {
    if (!this.canvasWrap || this.nodes.length === 0) return;
    const w = this.canvasWrap.clientWidth || 800;
    const h = this.canvasWrap.clientHeight || 600;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const node of this.nodes) {
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

  redraw(): void {
    if (!this.canvasCtx || !this.canvasWrap) return;
    draw(this.canvasCtx, this.canvasWrap.clientWidth, this.canvasWrap.clientHeight, this.containerEl, {
      nodes: this.nodes,
      zoom: this.zoom,
      pan: this.pan,
      projectionMode: this.projectionMode,
      showEdges: this.showEdges,
      edgeHops: this.edgeHops,
      relationEdges: this.relationEdges,
      selectedNodeIds: this.selectedNodeIds,
      hoveredNode: this.hoveredNode,
      isDraggingLasso: this.isDraggingLasso,
      lassoPath: this.lassoPath,
      scatterVisualStyle: this.settings.scatterVisualStyle,
      unselectedLabelOpacity: this.settings.unselectedLabelOpacity ?? 0.35,
    });

    if (this.searchHighlight) {
      const node = this.nodes.find((n) => n.id === this.searchHighlight!.nodeId);
      if (node) {
        const accent = getComputedStyle(this.containerEl).getPropertyValue("--interactive-accent")?.trim() || "#38bdf8";
        drawSearchPulse(this.canvasCtx, node, performance.now() - this.searchHighlight.startedAt, this.zoom, this.pan, accent);
      }
    }
  }

  async scanVaultNotes(filterOverride?: string): Promise<void> {
    this.nodes = await scanVaultNotesPure(this.app, filterOverride, this.settings.vectorSearchExclusions);
    this.applyLayout();
    await this.loadRelationEdges();
    this.fitToView();
    this.redraw();
  }

  applyLayout(): void {
    applyVectorLayout(this.nodes, this.settings, this.nodeSpacing, this.cloudSpacing, this.relationEdges);
  }

  async loadRelationEdges(): Promise<void> {
    this.relationEdges = await loadRelationEdgesPure(this.app);
  }

  hitTest(mouseX: number, mouseY: number): ScatterNode | null {
    return hitTestPure(this.nodes, mouseX, mouseY, this.zoom, this.pan);
  }

  /** Lets the sidebar's "Nahestehende Notizen" radar show this exact note without switching the actual editor tab (a click here only selects for synthesis). */
  focusSidebar(node: ScatterNode): void {
    const file = this.app.vault.getAbstractFileByPath(node.path);
    if (file instanceof TFile) this.host.focusSidebarNote(file);
  }

  hitTestEdge(mouseX: number, mouseY: number): RelationEdge | null {
    const activeNodeIds = new Set(this.selectedNodeIds);
    if (this.hoveredNode) activeNodeIds.add(this.hoveredNode.id);
    return hitTestEdgePure(this.nodes, this.relationEdges, activeNodeIds, this.edgeHops, mouseX, mouseY, this.zoom, this.pan);
  }

  private refreshRelationEdges(): void {
    void this.loadRelationEdges().then(() => this.redraw());
  }

  openRelationBuilder(selected: ScatterNode[]): void {
    new RelationBuilderModal(this.app, this, selected, undefined, () => this.refreshRelationEdges()).open();
  }

  editRelationEdge(edge: RelationEdge): void {
    const srcNode = this.nodes.find((n) => n.id.toLowerCase() === edge.srcId);
    const tgtNode = this.nodes.find((n) => n.id.toLowerCase() === edge.tgtId);
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
      this.lastSearchMatches = findNodesByQuery(this.nodes, query);
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

    if (this.searchAnimHandle !== null) cancelAnimationFrame(this.searchAnimHandle);
    const startedAt = performance.now();
    this.searchHighlight = { nodeId: match.id, startedAt };

    const tick = (): void => {
      this.redraw();
      if (performance.now() - startedAt < SEARCH_PULSE_DURATION_MS) {
        this.searchAnimHandle = requestAnimationFrame(tick);
      } else {
        this.searchHighlight = null;
        this.searchAnimHandle = null;
        this.redraw();
      }
    };
    this.searchAnimHandle = requestAnimationFrame(tick);
  }

  async runSynthesis(setHoverText: (text: string) => void, customQuestion?: string): Promise<void> {
    const selected = this.nodes.filter((n) => this.selectedNodeIds.has(n.id));
    await runSynthesis(this.app, this.settings, selected, setHoverText, customQuestion);
  }
}
