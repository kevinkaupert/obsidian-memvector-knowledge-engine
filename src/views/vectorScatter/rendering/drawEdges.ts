import type { RelationEdge, ScatterNode } from "../types";
import type { PanState } from "../hitTesting";
import { worldToScreen } from "../hitTesting";

const EDGE_COLORS: Record<string, string> = {
  PROVES: "#10b981",
  REQUIRES: "#3b82f6",
  IMPLIES: "#8b5cf6",
  DEFINES: "#06b6d4",
  EXTENDS: "#6366f1",
  CONTRADICTS: "#ef4444",
  USES: "#f59e0b",
};

/** Only renders edges touching a selected or hovered node - never the full graph at once. */
export function drawEdges(
  ctx: CanvasRenderingContext2D,
  nodeMap: Map<string, ScatterNode>,
  relationEdges: RelationEdge[],
  selectedNodeIds: Set<string>,
  hoveredNode: ScatterNode | null,
  zoom: number,
  pan: PanState,
  themeTextNormal: string
): void {
  const activeNodeIds = new Set(selectedNodeIds);
  if (hoveredNode) activeNodeIds.add(hoveredNode.id);
  if (activeNodeIds.size === 0) return;

  relationEdges.forEach((edge) => {
    if (edge.relType === "RELATED_TO") return;
    const srcNode = nodeMap.get(edge.srcId);
    const tgtNode = nodeMap.get(edge.tgtId);
    if (!srcNode || !tgtNode) return;

    const isSrcSelected = activeNodeIds.has(srcNode.id);
    const isTgtSelected = activeNodeIds.has(tgtNode.id);
    if (!isSrcSelected && !isTgtSelected) return;

    const p1 = worldToScreen(srcNode.x, srcNode.y, zoom, pan);
    const p2 = worldToScreen(tgtNode.x, tgtNode.y, zoom, pan);
    const edgeColor = EDGE_COLORS[edge.relType] || "#94a3b8";

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = isSrcSelected || isTgtSelected ? edgeColor : "rgba(148, 163, 184, 0.35)";
    ctx.lineWidth = isSrcSelected || isTgtSelected ? 2.5 : 1.2;
    if (isSrcSelected || isTgtSelected) {
      ctx.shadowColor = edgeColor;
      ctx.shadowBlur = 8;
    }
    ctx.stroke();

    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const headLen = 10 * zoom;
    const arrowX = p2.x - 12 * zoom * Math.cos(angle);
    const arrowY = p2.y - 12 * zoom * Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(arrowX - headLen * Math.cos(angle - Math.PI / 6), arrowY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(arrowX - headLen * Math.cos(angle + Math.PI / 6), arrowY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = edgeColor;
    ctx.fill();

    if (isSrcSelected || isTgtSelected || zoom > 0.8) {
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
    }
    ctx.restore();
  });
}
