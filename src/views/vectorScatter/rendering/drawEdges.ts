import type { ScatterVisualStyle } from "../../../settings/types";
import { computeHopReachableNodeIds } from "../edgeHops";
import type { RelationEdge, ScatterNode } from "../types";
import type { PanState } from "../hitTesting";
import { worldToScreen } from "../hitTesting";

/** The 13 standardized labels from relationTermMapping.ts - anything else (older vault relation files) falls back to NEUTRAL_EDGE. */
const EDGE_COLORS_MUTED: Record<string, string> = {
  IMPLIES: "#a897c9",
  REQUIRES: "#6f93c9",
  EQUIVALENT_TO: "#6fb8c9",
  GENERALIZES: "#6fae8e",
  SPECIALIZES: "#8fae6f",
  EXTENDS: "#8890c9",
  REDUCES_TO: "#c9a25e",
  CONSTRUCTS: "#c98f6f",
  EMBEDS_IN: "#6fc9a2",
  REFUTES: "#c97f7f",
  CONFLICTS_WITH: "#d96f6f",
  INDEPENDENT_OF: "#9098a3",
  ANALOGOUS_TO: "#c98fae",
};

const NEUTRAL_EDGE = "rgba(148, 163, 184, 0.32)";

function drawArrowhead(ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }, zoom: number, color: string): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const headLen = 9 * zoom;
  const arrowX = to.x - 12 * zoom * Math.cos(angle);
  const arrowY = to.y - 12 * zoom * Math.sin(angle);
  ctx.beginPath();
  ctx.moveTo(arrowX, arrowY);
  ctx.lineTo(arrowX - headLen * Math.cos(angle - Math.PI / 6), arrowY - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(arrowX - headLen * Math.cos(angle + Math.PI / 6), arrowY - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** Only renders edges within `hops` of a currently selected/hovered node (hops=0 shows every edge unconditionally) - so "Kanten anzeigen" stays legible even in a dense vault while still letting the radius be widened. */
export function drawEdges(
  ctx: CanvasRenderingContext2D,
  nodeMap: Map<string, ScatterNode>,
  relationEdges: RelationEdge[],
  selectedNodeIds: Set<string>,
  hoveredNode: ScatterNode | null,
  hops: number,
  zoom: number,
  pan: PanState,
  themeTextNormal: string,
  themeAccent: string,
  style: ScatterVisualStyle
): void {
  const activeNodeIds = new Set(selectedNodeIds);
  if (hoveredNode) activeNodeIds.add(hoveredNode.id);
  if (hops !== 0 && activeNodeIds.size === 0) return;
  const reachable = hops === 0 ? null : computeHopReachableNodeIds(relationEdges, nodeMap, activeNodeIds, hops);

  relationEdges.forEach((edge) => {
    if (edge.relType === "RELATED_TO") return;
    const srcNode = nodeMap.get(edge.srcId);
    const tgtNode = nodeMap.get(edge.tgtId);
    if (!srcNode || !tgtNode) return;
    if (reachable && !reachable.has(srcNode.id) && !reachable.has(tgtNode.id)) return;

    const edgeColor = style === "muted" ? EDGE_COLORS_MUTED[edge.relType] || NEUTRAL_EDGE : themeAccent;

    const p1 = worldToScreen(srcNode.x, srcNode.y, zoom, pan);
    const p2 = worldToScreen(tgtNode.x, tgtNode.y, zoom, pan);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    drawArrowhead(ctx, p1, p2, zoom, edgeColor);
    if (edge.bidirectional) drawArrowhead(ctx, p2, p1, zoom, edgeColor);

    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const rawDesc = edge.desc || "";
    const descText = rawDesc.length > 42 ? `${rawDesc.slice(0, 40)}...` : rawDesc;
    const typeLabel = edge.bidirectional ? `[${edge.relType} ↔]` : `[${edge.relType}]`;

    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = descText ? "top" : "middle";
    ctx.fillStyle = edgeColor;
    ctx.fillText(typeLabel, midX, descText ? midY - 14 : midY);

    if (descText) {
      ctx.font = "9px sans-serif";
      ctx.fillStyle = themeTextNormal;
      ctx.fillText(descText, midX, midY + 1);
    }
    ctx.restore();
  });
}
