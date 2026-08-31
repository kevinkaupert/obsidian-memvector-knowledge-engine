import { CLOUD_PALETTES } from "../../../constants";
import type { ScatterVisualStyle } from "../../../settings/types";
import type { ScatterNode } from "../types";
import type { PanState } from "../hitTesting";
import { worldToScreen } from "../hitTesting";

interface ClusterHull {
  cloudId: number;
  cx: number;
  cy: number;
  r: number;
  count: number;
  label: string;
}

function computeClusterHulls(nodes: ScatterNode[], zoom: number, pan: PanState): ClusterHull[] {
  const groups = new Map<number, ScatterNode[]>();
  nodes.forEach((n) => {
    if (n.cloudId === undefined) return;
    if (!groups.has(n.cloudId)) groups.set(n.cloudId, []);
    groups.get(n.cloudId)!.push(n);
  });

  const hulls: ClusterHull[] = [];
  groups.forEach((groupNodes, cloudId) => {
    const points = groupNodes.map((n) => worldToScreen(n.x, n.y, zoom, pan));
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
    const r = Math.max(...points.map((p) => Math.hypot(p.x - cx, p.y - cy))) + 40 * zoom;
    hulls.push({ cloudId, cx, cy, r, count: groupNodes.length, label: groupNodes[0].cloudLabel || `Thema ${cloudId + 1}` });
  });
  return hulls;
}

function drawGlow(ctx: CanvasRenderingContext2D, hull: ClusterHull, palette: { inner: string; outer: string }): void {
  const grad = ctx.createRadialGradient(hull.cx, hull.cy, 0, hull.cx, hull.cy, hull.r);
  grad.addColorStop(0, palette.inner);
  grad.addColorStop(1, palette.outer);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(hull.cx, hull.cy, hull.r, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Topic-cluster background, per visual style:
 * - "monochrome" / "ink": nothing - "ink"'s focus glow highlights individual
 *   *related notes* instead (see drawNodes.ts).
 * - "muted": one soft desaturated glow per cluster (normal blend, not additive - overlaps no longer blow out).
 */
export function drawClusters(
  ctx: CanvasRenderingContext2D,
  nodes: ScatterNode[],
  zoom: number,
  pan: PanState,
  projectionMode: string | undefined,
  style: ScatterVisualStyle
): void {
  if (nodes.length === 0) return;
  const hulls = computeClusterHulls(nodes, zoom, pan);

  if (style === "muted") {
    hulls.forEach((hull) => {
      const palette = CLOUD_PALETTES[hull.cloudId % CLOUD_PALETTES.length];
      drawGlow(ctx, hull, palette);
    });
  }

  if (!projectionMode || projectionMode === "cloud" || projectionMode === "graphvector") {
    hulls.forEach((hull) => {
      const palette = CLOUD_PALETTES[hull.cloudId % CLOUD_PALETTES.length];
      const labelColor = style === "muted" ? palette.labelColor : "rgba(148, 163, 184, 0.85)";
      ctx.save();
      ctx.font = "bold 11px var(--font-interface, sans-serif)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = labelColor;
      ctx.fillText(`${hull.label.toUpperCase()} (${hull.count})`, hull.cx, hull.cy - hull.r - 14);
      ctx.restore();
    });
  }
}
