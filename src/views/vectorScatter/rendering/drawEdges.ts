import type { ScatterVisualStyle } from "../../../settings/types";
import { computeHopReachableNodeIds } from "../edgeHops";
import type { RelationEdge, ScatterNode } from "../types";
import type { PanState } from "../hitTesting";
import { worldToScreen } from "../hitTesting";

const EDGE_COLORS_MUTED: Record<string, string> = {
  PROVES: "#6fae8e",
  REQUIRES: "#6f93c9",
  IMPLIES: "#a897c9",
  DEFINES: "#6fb8c9",
  EXTENDS: "#8890c9",
  CONTRADICTS: "#c97f7f",
  USES: "#c9a25e",
};

const NEUTRAL_EDGE = "rgba(148, 163, 184, 0.32)";

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

    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const headLen = 9 * zoom;
    const arrowX = p2.x - 12 * zoom * Math.cos(angle);
    const arrowY = p2.y - 12 * zoom * Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(arrowX - headLen * Math.cos(angle - Math.PI / 6), arrowY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(arrowX - headLen * Math.cos(angle + Math.PI / 6), arrowY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = edgeColor;
    ctx.fill();

    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const rawDesc = edge.desc || "";
    const descText = rawDesc.length > 42 ? `${rawDesc.slice(0, 40)}...` : rawDesc;

    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = descText ? "top" : "middle";
    ctx.fillStyle = edgeColor;
    ctx.fillText(`[${edge.relType}]`, midX, descText ? midY - 14 : midY);

    if (descText) {
      ctx.font = "9px sans-serif";
      ctx.fillStyle = themeTextNormal;
      ctx.fillText(descText, midX, midY + 1);
    }
    ctx.restore();
  });
}
