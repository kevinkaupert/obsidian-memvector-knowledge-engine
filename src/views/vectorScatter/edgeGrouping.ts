import type { RelationEdge } from "./types";

export interface EdgeSlot {
  index: number;
  total: number;
}

export interface Point {
  x: number;
  y: number;
}

/** The unordered pair of nodes an edge connects, independent of direction - two edges with the same key connect the same two notes, whichever way each one points. */
export function groupKeyFor(edge: RelationEdge): string {
  return [edge.srcId.toLowerCase(), edge.tgtId.toLowerCase()].sort().join("|");
}

/**
 * Groups relation edges by the unordered pair of nodes they connect
 * (independent of direction), so N relations between the same two notes -
 * different types, or opposite directions - can be told apart on the canvas
 * instead of drawing/hit-testing on the exact same line, where only whichever
 * one is drawn last is visible and only whichever is iterated first is
 * clickable.
 */
export function computeEdgeSlots(edges: RelationEdge[]): Map<RelationEdge, EdgeSlot> {
  const groups = new Map<string, RelationEdge[]>();
  for (const e of edges) {
    const key = groupKeyFor(e);
    const group = groups.get(key);
    if (group) group.push(e);
    else groups.set(key, [e]);
  }

  const result = new Map<RelationEdge, EdgeSlot>();
  groups.forEach((group) => {
    group.forEach((e, index) => result.set(e, { index, total: group.length }));
  });
  return result;
}

/** The un-fanned slot - draws/tests the plain straight-line position, as if this edge were the only one between its pair. Used to render/hit-test a multi-edge bundle collapsed to one line until the cursor actually approaches it. */
export const COLLAPSED_SLOT: EdgeSlot = { index: 0, total: 1 };

/** Screen-space bulge (px) per slot step, deliberately not zoom-scaled - the curves should stay just as visually separated whether zoomed in or out. */
const BULGE_STEP_PX = 22;

/**
 * The (dx, dy) between the same two points regardless of which is passed as
 * p1/p2 - ordered by numeric position, not by which one happens to be this
 * particular edge's src or tgt. Two opposite-direction edges between the same
 * pair (a->b and b->a) hand computeControlPoint their endpoints swapped, and
 * a perpendicular derived straight from p2-p1 would flip sign along with
 * that swap - exactly cancelling out the two edges' opposite slot bulge and
 * making them land on the same side after all. Anchoring the direction to a
 * stable ordering instead keeps "which side is index 0's side" consistent
 * for the whole pair, independent of any one edge's direction.
 */
function canonicalDelta(p1: Point, p2: Point): { dx: number; dy: number } {
  const [a, b] = p1.x !== p2.x ? (p1.x < p2.x ? [p1, p2] : [p2, p1]) : p1.y <= p2.y ? [p1, p2] : [p2, p1];
  return { dx: b.x - a.x, dy: b.y - a.y };
}

/**
 * Quadratic-bezier control point for one edge's slot within its group -
 * `p1`/`p2` themselves (the actual node positions) never move, so every edge
 * still meets each node at exactly one point; only the curve's middle bulges
 * perpendicular to the straight line, fanning multiple edges between the same
 * pair apart without ever displacing where they touch the nodes.
 */
export function computeControlPoint(p1: Point, p2: Point, slot: EdgeSlot): Point {
  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  if (slot.total <= 1) return mid;

  const { dx, dy } = canonicalDelta(p1, p2);
  const len = Math.hypot(dx, dy) || 1;
  const bulge = (slot.index - (slot.total - 1) / 2) * BULGE_STEP_PX;
  return { x: mid.x + (-dy / len) * bulge, y: mid.y + (dx / len) * bulge };
}

/** Point at parameter t (0..1) along the quadratic bezier from p1 to p2 via control. */
export function pointOnCurve(p1: Point, control: Point, p2: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * p1.x + 2 * u * t * control.x + t * t * p2.x,
    y: u * u * p1.y + 2 * u * t * control.y + t * t * p2.y,
  };
}

/** Tangent direction (unit vector) at parameter t along the curve - lets an arrowhead point along the curve's actual approach angle instead of the straight p1->p2 direction. */
export function tangentOnCurve(p1: Point, control: Point, p2: Point, t: number): Point {
  const u = 1 - t;
  const dx = 2 * u * (control.x - p1.x) + 2 * t * (p2.x - control.x);
  const dy = 2 * u * (control.y - p1.y) + 2 * t * (p2.y - control.y);
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

const HIT_TEST_SAMPLES = 12;

/** Shortest distance from (px, py) to the curve, approximated by sampling it into a short polyline - precise closed-form bezier distance isn't worth the complexity for hit-testing at this scale. */
export function distanceToCurve(px: number, py: number, p1: Point, control: Point, p2: Point): number {
  let prev = p1;
  let min = Infinity;
  for (let i = 1; i <= HIT_TEST_SAMPLES; i++) {
    const t = i / HIT_TEST_SAMPLES;
    const cur = pointOnCurve(p1, control, p2, t);
    min = Math.min(min, distanceToSegment(px, py, prev.x, prev.y, cur.x, cur.y));
    prev = cur;
  }
  return min;
}

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
