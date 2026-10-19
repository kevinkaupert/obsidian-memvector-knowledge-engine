import type { App } from "obsidian";
import type { MemVectorSettings } from "../../settings/types";
import type { ProjectionMode } from "./layout/projections";
import type { LayoutMode } from "./layout/layoutEngine";
import type { RelationEdge, ScatterNode } from "./types";
import type { PanState } from "./hitTesting";

/**
 * Purpose: State of the mouse gesture in progress on the 2D canvas (#77).
 * Architecture: Only canvasInteraction.ts changes it; the view reads `isDraggingLasso` and `lassoPath` to draw the
 * lasso. The object itself is never replaced, so handlers may keep a reference; its fields are replaced freely.
 */
export interface InteractionState {
  isDraggingPan: boolean;
  isDraggingLasso: boolean;
  /** Pointer offset to `pan` at the start of a pan drag. */
  dragStart: PanState;
  /** Screen points of the lasso being drawn. */
  lassoPath: { x: number; y: number }[];
  /** Lasso without holding Shift. */
  lassoSelectMode: boolean;
}

export function createInteractionState(): InteractionState {
  return { isDraggingPan: false, isDraggingLasso: false, dragStart: { x: 0, y: 0 }, lassoPath: [], lassoSelectMode: false };
}

/**
 * The mutable state + operations that both toolbar.ts and
 * canvasInteraction.ts need. VectorScatterView implements this directly
 * (i.e. `this` from the original class becomes an explicit `ctx` parameter
 * here) so behavior stays identical while the wiring code lives in
 * separate files.
 *
 * Ownership: the view owns every field. Handlers always read fields through `ctx` at event time and never keep
 * them: scans replace `nodes`, `relationEdges` and `hoveredNode`, `fitToView` replaces `pan`, and hiding relation
 * notes replaces `selectedNodeIds` (a rescan prunes it in place). Gesture state lives in `interaction`.
 */
export interface ScatterViewContext {
  readonly app: App;
  settings: MemVectorSettings;
  saveSettings(): Promise<void>;
  /** Lets other open 2D views pick up a setting this view changed. */
  notifyOpenViews?(): void;
  viewFilterQuery: string;
  nodes: ScatterNode[];
  selectedNodeIds: Set<string>;
  pan: PanState;
  zoom: number;
  /** Transient state of the mouse gesture in progress; owned by canvasInteraction.ts, read by the redraw. */
  readonly interaction: InteractionState;
  hoveredNode: ScatterNode | null;
  hoveredEdge: RelationEdge | null;
  showEdges: boolean;
  showRelationNotes: boolean;
  edgeHops: number;
  relationEdges: RelationEdge[];
  nodeSpacing: number;
  cloudSpacing: number;
  projectionMode: ProjectionMode;

  getVisibleNodes(): ScatterNode[];
  setShowRelationNotes(show: boolean): void;
  redraw(): void;
  scanVaultNotes(filterOverride?: string, options?: { preserveView?: boolean }): Promise<void>;
  /** Sets the view filter: hides and shows notes without a rescan or a layout change (Plan 0005 S2). */
  setViewFilter(query: string): void;
  applyLayout(mode?: LayoutMode): void;
  rearrangeLayout(): Promise<void>;
  /** Reloads every vector from the store after a successful calculation and updates the layout. */
  onVectorsCalculated(): Promise<void>;
  loadRelationEdges(): Promise<void>;
  hitTest(x: number, y: number): ScatterNode | null;
  focusSidebar(node: ScatterNode): void;
  hitTestEdge(x: number, y: number): RelationEdge | null;
  openRelationBuilder(selected: ScatterNode[]): void;
  editRelationEdge(edge: RelationEdge): void;
  searchNote(query: string): void;
  fitToView(): void;
  runSynthesis(setHoverText: (text: string) => void, customQuestion?: string, excludedContextIds?: ReadonlySet<string>): Promise<void>;
}
