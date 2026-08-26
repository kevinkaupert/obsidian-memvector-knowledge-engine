import type { ScatterVisualStyle } from "../../../settings/types";
import type { RelationTally } from "../relatedNodes";
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
/** WikiLink-relation color in the "ink" style - deliberately warm, so it reads as distinct from the (usually cool-toned) --interactive-accent used for Memgraph relations and the active selection. */
const WIKILINK_COLOR = "#d9a44a";

function drawHalo(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string | CanvasGradient): void {
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/** Splits the ring/halo left-to-right in proportion to how many of the connections to this note are WikiLinks (gold) vs. Memgraph edges (accent) - e.g. 2 WikiLinks + 1 Memgraph edge reads as 2/3 gold, 1/3 accent, not a flat 50/50 blend. */
function relationColor(ctx: CanvasRenderingContext2D, tally: RelationTally, x: number, y: number, radius: number, accent: string): string | CanvasGradient {
  if (tally.memgraph === 0) return WIKILINK_COLOR;
  if (tally.wikilink === 0) return accent;

  const goldShare = tally.wikilink / (tally.wikilink + tally.memgraph);
  const feather = 0.04;
  const grad = ctx.createLinearGradient(x - radius, y, x + radius, y);
  grad.addColorStop(Math.max(0, goldShare - feather), WIKILINK_COLOR);
  grad.addColorStop(Math.min(1, goldShare + feather), accent);
  return grad;
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
  style: ScatterVisualStyle,
  relationTallies: Map<string, RelationTally> = new Map(),
  unselectedLabelOpacity = 1
): void {
  const hasFocus = selectedNodeIds.size > 0 || hoveredNode !== null;

  nodes.forEach((node) => {
    const pos = worldToScreen(node.x, node.y, zoom, pan);
    const isSelected = selectedNodeIds.has(node.id);
    const isHovered = hoveredNode === node;
    const isActive = isSelected || isHovered;
    const tally = !isActive ? relationTallies.get(node.id) : undefined;
    const radius = (isSelected ? 8 : 6) * zoom;

    if (style === "ink") {
      if (tally) drawHalo(ctx, pos.x, pos.y, radius + 5, relationColor(ctx, tally, pos.x, pos.y, radius + 5, themeAccent));
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      if (isActive) {
        ctx.fillStyle = themeAccent;
        ctx.fill();
      } else {
        ctx.lineWidth = tally ? 1.75 : 1.25;
        ctx.strokeStyle = tally ? relationColor(ctx, tally, pos.x, pos.y, radius, themeAccent) : NEUTRAL_RING;
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

    if (zoom > 0.45 || isActive || tally) {
      let titleText = node.title;
      if (titleText.length > 22 && !isActive && zoom < 1.1) {
        titleText = `${titleText.slice(0, 20)}…`;
      }
      const fontH = Math.max(9, Math.min(13, 10 * zoom));
      const isDimmed = hasFocus && !isActive && !tally;
      ctx.save();
      ctx.globalAlpha = isDimmed ? unselectedLabelOpacity : 1;
      ctx.font = `${fontH}px sans-serif`;
      ctx.fillStyle = isSelected ? themeAccent : isHovered ? themeTextNormal : themeTextMuted;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(titleText, pos.x, pos.y + 12 * zoom + 1);
      ctx.restore();
    }
  });
}
