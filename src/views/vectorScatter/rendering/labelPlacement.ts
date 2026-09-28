/**
 * Purpose: Greedy screen-space label decluttering shared by drawClusters and drawNodes.
 * Architecture: Callers reserve rects in priority order - cluster labels first, then the node
 * labels that must stay readable (selected/hovered/tallied), then everyone else, who yields when
 * they would overlap something already placed. Reservations go into a uniform grid rather than a
 * flat list, so a dense vault does not turn every frame into an O(n^2) rect comparison while the
 * canvas redraws on each animation frame during pan/zoom.
 */
export interface LabelRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Grid cell edge in screen pixels - a few typical label widths, so a rect touches very few cells. */
const CELL_SIZE = 96;

function rectsOverlap(a: LabelRect, b: LabelRect): boolean {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
}

export interface LabelPlacer {
  /**
   * Attempts to reserve `rect`. Returns false and reserves nothing when it collides with an
   * already-placed rect, unless `force` is set - a forced rect always draws and is reserved so
   * lower-priority labels placed afterwards steer clear of it.
   */
  tryPlace(rect: LabelRect, force?: boolean): boolean;
  /** Number of reserved rects - for tests and diagnostics. */
  readonly size: number;
}

/** Creates an empty placer. One per frame; the reservations are screen-space and must not outlive it. */
export function createLabelPlacer(): LabelPlacer {
  const cells = new Map<string, LabelRect[]>();
  let count = 0;

  const cellRange = (rect: LabelRect) => ({
    cx1: Math.floor(rect.x1 / CELL_SIZE),
    cx2: Math.floor(rect.x2 / CELL_SIZE),
    cy1: Math.floor(rect.y1 / CELL_SIZE),
    cy2: Math.floor(rect.y2 / CELL_SIZE),
  });

  return {
    tryPlace(rect: LabelRect, force = false): boolean {
      const { cx1, cx2, cy1, cy2 } = cellRange(rect);
      if (!force) {
        for (let cx = cx1; cx <= cx2; cx++) {
          for (let cy = cy1; cy <= cy2; cy++) {
            const bucket = cells.get(`${cx}:${cy}`);
            if (bucket && bucket.some((placed) => rectsOverlap(placed, rect))) return false;
          }
        }
      }
      for (let cx = cx1; cx <= cx2; cx++) {
        for (let cy = cy1; cy <= cy2; cy++) {
          const key = `${cx}:${cy}`;
          const bucket = cells.get(key);
          if (bucket) bucket.push(rect);
          else cells.set(key, [rect]);
        }
      }
      count++;
      return true;
    },
    get size(): number {
      return count;
    },
  };
}
