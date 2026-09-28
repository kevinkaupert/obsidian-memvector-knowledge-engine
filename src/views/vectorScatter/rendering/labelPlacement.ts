/**
 * Purpose: Greedy screen-space label decluttering shared by drawClusters and drawNodes.
 * Rects are added in priority order (clusters, then active/focused nodes, then the rest);
 * a rect that overlaps one already placed is rejected so its label is skipped.
 */
export interface LabelRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function rectsOverlap(a: LabelRect, b: LabelRect): boolean {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
}

/**
 * Attempts to reserve `rect` in `occupied`. Returns false (and leaves `occupied` untouched)
 * if it collides with an already-placed label and `force` is not set.
 */
export function tryPlaceLabel(occupied: LabelRect[], rect: LabelRect, force = false): boolean {
  if (!force && occupied.some((r) => rectsOverlap(r, rect))) return false;
  occupied.push(rect);
  return true;
}
