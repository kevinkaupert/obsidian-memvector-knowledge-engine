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
 * Purpose: Checks if a scatter node's center coordinate is within the world-coordinate viewport bounding box.
 */
export function isNodeInViewport(node: ScatterNode, viewport: ViewportBounds): boolean {
  return (
    node.x >= viewport.minX &&
    node.x <= viewport.maxX &&
    node.y >= viewport.minY &&
    node.y <= viewport.maxY
  );
}

/**
 * Purpose: Determines whether a relation edge between two nodes could intersect the visible canvas viewport.
 * Architecture: Evaluates the bounding box spanned by both node endpoints. If both endpoints are strictly
 * beyond the same side of the viewport + margin, the edge (and its fan curvature) cannot intersect the screen (Issue #158).
 */
export function isEdgeInViewport(
  src: ScatterNode,
  tgt: ScatterNode,
  viewport: ViewportBounds
): boolean {
  const minEdgeX = Math.min(src.x, tgt.x);
  const maxEdgeX = Math.max(src.x, tgt.x);
  const minEdgeY = Math.min(src.y, tgt.y);
  const maxEdgeY = Math.max(src.y, tgt.y);

  if (maxEdgeX < viewport.minX) return false;
  if (minEdgeX > viewport.maxX) return false;
  if (maxEdgeY < viewport.minY) return false;
  if (minEdgeY > viewport.maxY) return false;

  return true;
}
