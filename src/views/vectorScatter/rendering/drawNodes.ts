import type { ScatterNode } from "../types";
import type { PanState } from "../hitTesting";
import { worldToScreen } from "../hitTesting";

const TYPE_COLORS: Record<string, string> = {
  definition: "#3b82f6",
  theorem: "#10b981",
  concept: "#f59e0b",
  relation: "#8b5cf6",
  synthesis: "#ec4899",
  course: "#6366f1",
  question: "#ef4444",
  source: "#6b7280",
};

export function drawNodes(
  ctx: CanvasRenderingContext2D,
  nodes: ScatterNode[],
  selectedNodeIds: Set<string>,
  hoveredNode: ScatterNode | null,
  zoom: number,
  pan: PanState,
  themeTextNormal: string,
  themeTextMuted: string
): void {
  nodes.forEach((node) => {
    const pos = worldToScreen(node.x, node.y, zoom, pan);
    const isSelected = selectedNodeIds.has(node.id);
    const isHovered = hoveredNode === node;
    const color = TYPE_COLORS[node.type] || "#94a3b8";

    if (isSelected || isHovered) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, (isSelected ? 16 : 12) * zoom, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? "rgba(59, 130, 246, 0.35)" : "rgba(255, 255, 255, 0.25)";
      ctx.fill();
      ctx.strokeStyle = isSelected ? "#60a5fa" : "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, (isSelected ? 8 : 6) * zoom, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    if (zoom > 0.45 || isSelected || isHovered) {
      let titleText = node.title;
      if (titleText.length > 22 && !isSelected && !isHovered && zoom < 1.1) {
        titleText = `${titleText.slice(0, 20)}…`;
      }
      const fontH = Math.max(9, Math.min(13, 10 * zoom));
      ctx.font = `${fontH}px sans-serif`;
      ctx.save();
      ctx.fillStyle = isSelected ? "#ffffff" : isHovered ? themeTextNormal : themeTextMuted;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(titleText, pos.x, pos.y + 12 * zoom + 1);
      ctx.restore();
    }
  });
}
