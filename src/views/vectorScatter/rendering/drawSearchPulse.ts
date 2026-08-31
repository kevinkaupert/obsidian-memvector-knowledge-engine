import type { ScatterNode } from "../types";
import type { PanState } from "../hitTesting";
import { worldToScreen } from "../hitTesting";

const PULSE_PERIOD_MS = 600;

/** Radar-ping ring drawn on top of the scene while a search match is being located - always the accent color, independent of the active visual style, so it reads clearly no matter which one is active. */
export function drawSearchPulse(
  ctx: CanvasRenderingContext2D,
  node: ScatterNode,
  elapsedMs: number,
  zoom: number,
  pan: PanState,
  accentColor: string
): void {
  const phase = (elapsedMs % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
  const pos = worldToScreen(node.x, node.y, zoom, pan);
  const radius = (10 + phase * 22) * zoom;

  ctx.save();
  ctx.globalAlpha = 0.85 * (1 - phase);
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
}
