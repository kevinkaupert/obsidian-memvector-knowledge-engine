import type { PanState } from "../hitTesting";
import type { ScatterNode } from "../types";

export interface ViewportBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Purpose: Computes the visible 2D world-coordinate bounding box given the canvas pixel size, zoom, and pan offset.
 * Architecture: Incorporates a screen-space buffer margin (default 100px) so node dots, labels, and halos
 * near the canvas edge do not pop into view abruptly (Issue #63 Phase 2, Issue #158).
 */
export function computeWorldViewport(
  width: number,
  height: number,
  zoom: number,
  pan: PanState,
  marginPx = 100
): ViewportBounds {
  const safeZoom = zoom > 0 ? zoom : 1;
  const marginWorld = marginPx / safeZoom;
  const minX = -pan.x / safeZoom - marginWorld;
  const maxX = (width - pan.x) / safeZoom + marginWorld;
  const minY = -pan.y / safeZoom - marginWorld;
  const maxY = (height - pan.y) / safeZoom + marginWorld;
  return { minX, maxX, minY, maxY };
}

/**
 * Screen-space reach of a node's label beyond its center: horizontally half of a ~45-character title at the largest
 * label font (covers truncated labels and most untruncated focus labels), vertically the label's offset plus height
 * below the dot.
 */
export const NODE_LABEL_REACH_PX = { x: 160, y: 32 };

/**
 * Purpose: Checks whether a scatter node or its label can reach into the world-coordinate viewport.
 * Architecture: The center test is widened by the label's reach (screen px, converted with `zoom`), so a node just
 * outside the margin still draws while part of its label would be visible (#163). Omitting `zoom` tests the center only.
 */
export function isNodeInViewport(node: ScatterNode, viewport: ViewportBounds, zoom?: number): boolean {
  const reachX = zoom ? NODE_LABEL_REACH_PX.x / zoom : 0;
  const reachY = zoom ? NODE_LABEL_REACH_PX.y / zoom : 0;
  return (
    node.x + reachX >= viewport.minX &&
    node.x - reachX <= viewport.maxX &&
    node.y + reachY >= viewport.minY &&
    node.y - reachY <= viewport.maxY
  );
}

/**
 * Purpose: Determines whether a relation edge between two nodes could intersect the visible canvas viewport.
 * Architecture: A quadratic curve lies inside the triangle of its endpoints and control point, so the bounding box of
 * those three points is a safe test: an edge is culled only when that whole box lies beyond one side of the viewport +
 * margin. Without `control` the edge is treated as a straight line (#158, #163).
 */
export function isEdgeInViewport(
  src: { x: number; y: number },
  tgt: { x: number; y: number },
  viewport: ViewportBounds,
  control?: { x: number; y: number }
): boolean {
  const points = control ? [src, tgt, control] : [src, tgt];
  const minEdgeX = Math.min(...points.map((p) => p.x));
  const maxEdgeX = Math.max(...points.map((p) => p.x));
  const minEdgeY = Math.min(...points.map((p) => p.y));
  const maxEdgeY = Math.max(...points.map((p) => p.y));

  if (maxEdgeX < viewport.minX) return false;
  if (minEdgeX > viewport.maxX) return false;
  if (maxEdgeY < viewport.minY) return false;
  if (minEdgeY > viewport.maxY) return false;

  return true;
}
