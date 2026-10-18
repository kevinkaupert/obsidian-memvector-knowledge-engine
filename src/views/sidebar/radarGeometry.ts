/**
 * Purpose: Places the radar's neighbor notes in polar coordinates around the active note: the angle follows their 2D
 * map positions, the distance their score (1 - score of the radius).
 * Architecture: Split out of renderActiveNoteFocus (#76); pure, no DOM.
 */

import type { ScoredNote } from "./activeNoteScoring";
import type { Position2D } from "./nodePosition";

/** A neighbor on the radar: polar offset (dx, dy, dist) and the screen position the last draw gave it (x, y). */
export interface RadarNode extends ScoredNote {
  dx: number;
  dy: number;
  dist: number;
  x: number;
  y: number;
}

/** Neighbors as radar nodes; a neighbor at the active note's own position gets an evenly spread angle. */
export function placeRadarNeighbors(
  topNeighbors: ScoredNote[],
  positions: Map<string, Position2D>,
  activePos: Position2D,
  maxRadius: number
): RadarNode[] {
  return topNeighbors.map((item, idx) => {
    const nPos = positions.get(item.file.path)!;
    const rawDx = nPos.x - activePos.x;
    const rawDy = nPos.y - activePos.y;
    const angle = Math.hypot(rawDx, rawDy) > 1e-3 ? Math.atan2(rawDy, rawDx) : (idx / (topNeighbors.length || 1)) * Math.PI * 2;
    
    // True polar distance: score in [0, 1] -> distance in [0, 1]
    const score = Math.max(0, Math.min(1, item.score));
    const polarDist = (1 - score) * maxRadius;
    const dx = Math.cos(angle) * polarDist;
    const dy = Math.sin(angle) * polarDist;
    return { ...item, dx, dy, dist: polarDist, x: 0, y: 0 };
  });
}
