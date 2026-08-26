import type { ScatterVisualStyle } from "../../../settings/types";
import type { ScatterNode } from "../types";
import type { PanState } from "../hitTesting";
import { worldToScreen } from "../hitTesting";

const TYPE_COLORS_MUTED: Record<string, string> = {
  definition: "#6f93c9",
  theorem: "#6fae8e",
  concept: "#c9a25e",
  relation: "#a897c9",
  synthesis: "#c98fae",
  course: "#8890c9",
  question: "#c98f8f",
  source: "#9098a3",
};

const NEUTRAL_DOT = "#8a8f97";
const NEUTRAL_RING = "rgba(148, 163, 184, 0.6)";

function drawHalo(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string): void {
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

export function drawNodes(
  ctx: CanvasRenderingContext2D,
  nodes: ScatterNode[],
  selectedNodeIds: Set<string>,
  hoveredNode: ScatterNode | null,
  zoom: number,
  pan: PanState,
  themeTextNormal: string,
  themeTextMuted: string,
  themeAccent: string,
  style: ScatterVisualStyle
): void {
  nodes.forEach((node) => {
    const pos = worldToScreen(node.x, node.y, zoom, pan);
    const isSelected = selectedNodeIds.has(node.id);
    const isHovered = hoveredNode === node;
    const isActive = isSelected || isHovered;
    const radius = (isSelected ? 8 : 6) * zoom;

    if (style === "ink") {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      if (isActive) {
        ctx.fillStyle = themeAccent;
        ctx.fill();
      } else {
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = NEUTRAL_RING;
        ctx.stroke();
      }
    } else {
      if (isActive) drawHalo(ctx, pos.x, pos.y, radius + 6, themeAccent);
      const fill = isActive ? themeAccent : style === "muted" ? TYPE_COLORS_MUTED[node.type] || NEUTRAL_DOT : NEUTRAL_DOT;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      if (style === "muted") {
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(15, 23, 42, 0.35)";
        ctx.stroke();
      }
    }

    if (zoom > 0.45 || isActive) {
      let titleText = node.title;
      if (titleText.length > 22 && !isActive && zoom < 1.1) {
        titleText = `${titleText.slice(0, 20)}…`;
      }
      const fontH = Math.max(9, Math.min(13, 10 * zoom));
      ctx.save();
      ctx.font = `${fontH}px sans-serif`;
      ctx.fillStyle = isSelected ? themeAccent : isHovered ? themeTextNormal : themeTextMuted;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(titleText, pos.x, pos.y + 12 * zoom + 1);
      ctx.restore();
    }
  });
}
