import type { ScatterVisualStyle } from "../../../settings/types";
import type { RelationEdge, ScatterNode } from "../types";
import type { PanState } from "../hitTesting";
import { drawClusters } from "./drawClusters";
import { drawEdges } from "./drawEdges";
import { drawNodes } from "./drawNodes";

export interface DrawState {
  nodes: ScatterNode[];
  zoom: number;
  pan: PanState;
  projectionMode: string | undefined;
  showEdges: boolean;
  relationEdges: RelationEdge[];
  selectedNodeIds: Set<string>;
  hoveredNode: ScatterNode | null;
  isDraggingLasso: boolean;
  lassoPath: { x: number; y: number }[];
  scatterVisualStyle: ScatterVisualStyle;
}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, zoom: number, pan: PanState): void {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  ctx.lineWidth = 1;
  const gridSize = 50 * zoom;
  const startX = pan.x % gridSize;
  const startY = pan.y % gridSize;

  for (let x = startX; x < width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = startY; y < height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawLasso(ctx: CanvasRenderingContext2D, lassoPath: { x: number; y: number }[]): void {
  if (lassoPath.length <= 1) return;
  ctx.beginPath();
  ctx.moveTo(lassoPath[0].x, lassoPath[0].y);
  for (let i = 1; i < lassoPath.length; i++) ctx.lineTo(lassoPath[i].x, lassoPath[i].y);
  ctx.closePath();
  ctx.fillStyle = "rgba(59, 130, 246, 0.15)";
  ctx.fill();
  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function draw(ctx: CanvasRenderingContext2D, width: number, height: number, containerEl: HTMLElement | null, state: DrawState): void {
  ctx.clearRect(0, 0, width, height);

  const computedStyle = containerEl ? getComputedStyle(containerEl) : null;
  const themeTextNormal = computedStyle?.getPropertyValue("--text-normal")?.trim() || "#f8fafc";
  const themeTextMuted = computedStyle?.getPropertyValue("--text-muted")?.trim() || "#cbd5e1";
  const themeAccent = computedStyle?.getPropertyValue("--interactive-accent")?.trim() || "#38bdf8";

  drawGrid(ctx, width, height, state.zoom, state.pan);

  const nodeMap = new Map<string, ScatterNode>();
  state.nodes.forEach((n) => nodeMap.set(n.id.toLowerCase(), n));

  drawClusters(ctx, state.nodes, state.zoom, state.pan, state.projectionMode, state.scatterVisualStyle, state.selectedNodeIds, state.hoveredNode);

  if (state.showEdges && state.relationEdges.length > 0) {
    drawEdges(ctx, nodeMap, state.relationEdges, state.selectedNodeIds, state.hoveredNode, state.zoom, state.pan, themeTextNormal, themeAccent, state.scatterVisualStyle);
  }

  drawNodes(ctx, state.nodes, state.selectedNodeIds, state.hoveredNode, state.zoom, state.pan, themeTextNormal, themeTextMuted, themeAccent, state.scatterVisualStyle);

  if (state.isDraggingLasso) {
    drawLasso(ctx, state.lassoPath);
  }
}
