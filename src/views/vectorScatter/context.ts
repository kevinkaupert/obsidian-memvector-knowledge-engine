import type { App } from "obsidian";
import type { MemVectorSettings } from "../../settings/types";
import type { ProjectionMode } from "./layout/projections";
import type { RelationEdge, ScatterNode } from "./types";
import type { PanState } from "./hitTesting";

/**
 * The mutable state + operations that both toolbar.ts and
 * canvasInteraction.ts need. VectorScatterView implements this directly
 * (i.e. `this` from the original class becomes an explicit `ctx` parameter
 * here) so behavior stays identical while the wiring code lives in
 * separate files.
 */
export interface ScatterViewContext {
  readonly app: App;
  settings: MemVectorSettings;
  saveSettings(): Promise<void>;

  nodes: ScatterNode[];
  selectedNodeIds: Set<string>;
  pan: PanState;
  zoom: number;
  isDraggingPan: boolean;
  isDraggingLasso: boolean;
  dragStart: PanState;
  lassoPath: { x: number; y: number }[];
  lassoSelectMode: boolean;
  hoveredNode: ScatterNode | null;
  showEdges: boolean;
  relationEdges: RelationEdge[];
  nodeSpacing: number;
  cloudSpacing: number;
  projectionMode: ProjectionMode;

  redraw(): void;
  scanVaultNotes(filterOverride?: string): Promise<void>;
  applyLayout(): void;
  loadRelationEdges(): Promise<void>;
  hitTest(x: number, y: number): ScatterNode | null;
  hitTestEdge(x: number, y: number): RelationEdge | null;
  openRelationBuilder(selected: ScatterNode[]): void;
  editRelationEdge(edge: RelationEdge): void;
  runSynthesis(setHoverText: (text: string) => void, customQuestion?: string): Promise<void>;
}
