import { CLOUD_PALETTES } from "../../../constants";
import type { ScatterNode } from "../types";
import type { PanState } from "../hitTesting";
import { worldToScreen } from "../hitTesting";

/** Topic-cloud labels (cloud projection mode only) + the "kernel density" heatmap glow behind every node. */
export function drawClusters(
  ctx: CanvasRenderingContext2D,
  nodes: ScatterNode[],
  width: number,
  height: number,
  zoom: number,
  pan: PanState,
  projectionMode: string | undefined
): void {
  if ((!projectionMode || projectionMode === "cloud") && nodes.length > 0) {
    const cloudCenters = new Map<number, { sumX: number; sumY: number; minY: number; count: number; label: string }>();
    nodes.forEach((n) => {
      if (n.cloudId === undefined) return;
      if (!cloudCenters.has(n.cloudId)) {
        cloudCenters.set(n.cloudId, { sumX: 0, sumY: 0, minY: Infinity, count: 0, label: n.cloudLabel || `Thema ${n.cloudId + 1}` });
      }
      const c = cloudCenters.get(n.cloudId)!;
      c.sumX += n.x;
      c.sumY += n.y;
      if (n.y < c.minY) c.minY = n.y;
      c.count++;
    });

    cloudCenters.forEach((c, cloudId) => {
      if (c.count === 0) return;
      const avgX = c.sumX / c.count;
      const labelY = c.minY - 50;
      const pos = worldToScreen(avgX, labelY, zoom, pan);
      const palette = CLOUD_PALETTES[cloudId % CLOUD_PALETTES.length];

      ctx.save();
      ctx.font = "bold 11px var(--font-interface, sans-serif)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = palette.labelColor;
      ctx.fillText(`☁️ ${c.label.toUpperCase()} (${c.count})`, pos.x, pos.y);
      ctx.restore();
    });
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const heatmapRadius = 95 * zoom;
  nodes.forEach((node) => {
    const pos = worldToScreen(node.x, node.y, zoom, pan);
    if (pos.x < -heatmapRadius || pos.x > width + heatmapRadius || pos.y < -heatmapRadius || pos.y > height + heatmapRadius) return;

    const palette = CLOUD_PALETTES[(node.cloudId ?? 0) % CLOUD_PALETTES.length];
    const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, heatmapRadius);
    grad.addColorStop(0, palette.inner);
    grad.addColorStop(0.6, palette.outer);
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, heatmapRadius, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}
