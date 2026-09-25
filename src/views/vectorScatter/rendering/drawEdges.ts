import type { ScatterVisualStyle } from "../../../settings/types";
import { COLLAPSED_SLOT, computeControlPoint, computeEdgeSlots, groupKeyFor, pointOnCurve, tangentOnCurve, type Point } from "../edgeGrouping";
import { computeHopReachableNodeIds } from "../edgeHops";
import type { RelationEdge, ScatterNode } from "../types";
import type { PanState } from "../hitTesting";
import { worldToScreen } from "../hitTesting";
import { hashString } from "../../../hash";

/**
 * Canonical Cypher relation types have dedicated semantic colors for instant
 * visual recognition, while vault-defined or custom relation labels are assigned
 * deterministically from a hash into the extended palette.
 */
export const CANONICAL_EDGE_COLORS: Record<string, string> = {
  IMPLIES: "#6f93c9",
  EQUIVALENT_TO: "#6fb8c9",
  CONFLICTS_WITH: "#d96f6f",
  REFUTES: "#c97f7f",
  REQUIRES: "#c98f6f",
  GENERALIZES: "#a897c9",
  SPECIALIZES: "#6fae8e",
  EXTENDS: "#8fae6f",
  CONSTRUCTS: "#c9a25e",
  EMBEDS_IN: "#6fc9a2",
  REDUCES_TO: "#8890c9",
  INDEPENDENT_OF: "#9098a3",
  ANALOGOUS_TO: "#c98fae",
};

export const EDGE_COLOR_PALETTE = [
  "#a897c9",
  "#6f93c9",
  "#6fb8c9",
  "#6fae8e",
  "#8fae6f",
  "#8890c9",
  "#c9a25e",
  "#c98f6f",
  "#6fc9a2",
  "#c97f7f",
  "#d96f6f",
  "#9098a3",
  "#c98fae",
];

export const NEUTRAL_EDGE = "rgba(148, 163, 184, 0.32)";

function hashLabel(label: string): number {
  return Math.abs(hashString(label));
}

/**
 * <Purpose: Resolves a distinct, semantic palette color for relation types, with dedicated colors for canonical Cypher labels and deterministic hashing for custom types.>
 */
export function colorForLabel(label: string): string {
  if (!label) return NEUTRAL_EDGE;
  const upper = label.trim().toUpperCase();
  if (CANONICAL_EDGE_COLORS[upper]) {
    return CANONICAL_EDGE_COLORS[upper];
  }
  return EDGE_COLOR_PALETTE[hashLabel(upper) % EDGE_COLOR_PALETTE.length];
}

/**
 * <Purpose: Determines the edge stroke color based on relation type, visual style (monochrome vs ink/muted), and theme accent.>
 */
export function resolveEdgeColor(relType: string, style: ScatterVisualStyle, themeAccent: string): string {
  if (style === "monochrome") {
    return themeAccent;
  }
  return colorForLabel(relType);
}

/** `tip` is where the arrowhead points to; `direction` is the unit vector it points along (the curve's tangent there, not necessarily straight p1->p2). */
function drawArrowhead(ctx: CanvasRenderingContext2D, tip: Point, direction: Point, zoom: number, color: string): void {
  const angle = Math.atan2(direction.y, direction.x);
  const headLen = 9 * zoom;
  const arrowX = tip.x - 12 * zoom * direction.x;
  const arrowY = tip.y - 12 * zoom * direction.y;
  ctx.beginPath();
  ctx.moveTo(arrowX, arrowY);
  ctx.lineTo(arrowX - headLen * Math.cos(angle - Math.PI / 6), arrowY - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(arrowX - headLen * Math.cos(angle + Math.PI / 6), arrowY - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/**
 * Only renders edges within `hops` of a currently selected/hovered node
 * (hops=0 shows every edge unconditionally) - so "Kanten anzeigen" stays
 * legible even in a dense vault while still letting the radius be widened.
 *
 * Purpose: Renders curved relation edges between connected nodes on the 2D canvas, fanning overlapping edges and labeling hovered connections.
 *
 * A pair with more than one relation stays collapsed to a single line by
 * default - only fanning out into separate quadratic curves once one of its
 * relations is hovered (matching hitTesting.ts's two-step bundle-then-strand
 * hit test) - so a graph with many multi-relation pairs doesn't read as
 * permanently cluttered. Whichever relation is actually hovered gets its
 * type/description text; the rest of a fanned-out bundle stays unlabeled.
 * Every edge still touches its two nodes at exactly one point regardless of
 * fan state (no node grows extra visual "points") - only the curve's middle
 * ever moves.
 */
export function drawEdges(
  ctx: CanvasRenderingContext2D,
  nodeMap: Map<string, ScatterNode>,
  relationEdges: RelationEdge[],
  selectedNodeIds: Set<string>,
  hoveredNode: ScatterNode | null,
  hoveredEdge: RelationEdge | null,
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
  const slots = computeEdgeSlots(relationEdges);
  const expandedGroupKey = hoveredEdge ? groupKeyFor(hoveredEdge) : null;

  relationEdges.forEach((edge) => {
    if (edge.relType === "RELATED_TO") return;
    const srcNode = nodeMap.get(edge.srcId.toLowerCase());
    const tgtNode = nodeMap.get(edge.tgtId.toLowerCase());
    if (!srcNode || !tgtNode) return;
    if (reachable && !reachable.has(srcNode.id) && !reachable.has(tgtNode.id)) return;

    const isHovered = edge === hoveredEdge;
    const edgeColor = resolveEdgeColor(edge.relType, style, themeAccent);

    const p1 = worldToScreen(srcNode.x, srcNode.y, zoom, pan);
    const p2 = worldToScreen(tgtNode.x, tgtNode.y, zoom, pan);
    const slot = slots.get(edge) || COLLAPSED_SLOT;
    const isExpanded = slot.total === 1 || groupKeyFor(edge) === expandedGroupKey;
    const control = computeControlPoint(p1, p2, isExpanded ? slot : COLLAPSED_SLOT);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.quadraticCurveTo(control.x, control.y, p2.x, p2.y);
    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = isHovered ? 3 : 2;
    ctx.globalAlpha = isHovered || !isExpanded ? 1 : 0.8;
    ctx.stroke();
    ctx.globalAlpha = 1;

    drawArrowhead(ctx, p2, tangentOnCurve(p1, control, p2, 1), zoom, edgeColor);
    if (edge.bidirectional) {
      const backTangent = tangentOnCurve(p1, control, p2, 0);
      drawArrowhead(ctx, p1, { x: -backTangent.x, y: -backTangent.y }, zoom, edgeColor);
    }

    if (isHovered) {
      const mid = pointOnCurve(p1, control, p2, 0.5);
      const rawDesc = edge.desc || "";
      const descText = rawDesc.length > 42 ? `${rawDesc.slice(0, 40)}...` : rawDesc;
      const typeLabel = edge.bidirectional ? `[${edge.relType} ↔]` : `[${edge.relType}]`;

      ctx.font = "bold 9px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = descText ? "top" : "middle";
      ctx.fillStyle = edgeColor;
      ctx.fillText(typeLabel, mid.x, descText ? mid.y - 14 : mid.y);

      if (descText) {
        ctx.font = "9px sans-serif";
        ctx.fillStyle = themeTextNormal;
        ctx.fillText(descText, mid.x, mid.y + 1);
      }
    }
    ctx.restore();
  });
}
