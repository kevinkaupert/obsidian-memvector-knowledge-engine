import type { ScatterNode } from "./types";

export interface PanState {
  x: number;
  y: number;
}

export function worldToScreen(wx: number, wy: number, zoom: number, pan: PanState): { x: number; y: number } {
  return { x: wx * zoom + pan.x, y: wy * zoom + pan.y };
}

export function hitTest(nodes: ScatterNode[], mouseX: number, mouseY: number, zoom: number, pan: PanState): ScatterNode | null {
  for (const node of nodes) {
    const pos = worldToScreen(node.x, node.y, zoom, pan);
    if (Math.hypot(mouseX - pos.x, mouseY - pos.y) <= 12) return node;
  }
  return null;
}
