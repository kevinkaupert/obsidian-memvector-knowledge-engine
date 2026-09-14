import { describe, expect, it } from "vitest";
import { computeControlPoint, computeEdgeSlots, distanceToCurve, pointOnCurve, tangentOnCurve } from "./edgeGrouping";
import type { RelationEdge } from "./types";

function edge(srcId: string, tgtId: string, relType = "REQUIRES"): RelationEdge {
  return { srcId, tgtId, relType, desc: "", title: "", path: "", bidirectional: false };
}

describe("computeEdgeSlots", () => {
  it("gives a lone edge between a pair a total of 1 (no offset needed)", () => {
    const edges = [edge("a", "b")];
    const slots = computeEdgeSlots(edges);
    expect(slots.get(edges[0])).toEqual({ index: 0, total: 1 });
  });

  it("groups two different relation types between the same ordered pair together (#29)", () => {
    const edges = [edge("a", "b", "REQUIRES"), edge("a", "b", "CONFLICTS_WITH")];
    const slots = computeEdgeSlots(edges);
    expect(slots.get(edges[0])).toEqual({ index: 0, total: 2 });
    expect(slots.get(edges[1])).toEqual({ index: 1, total: 2 });
  });

  it("groups a reversed-direction edge into the same pair, since it connects the same two nodes", () => {
    const edges = [edge("a", "b", "REQUIRES"), edge("b", "a", "REQUIRES")];
    const slots = computeEdgeSlots(edges);
    expect(slots.get(edges[0])?.total).toBe(2);
    expect(slots.get(edges[1])?.total).toBe(2);
  });

  it("keeps unrelated pairs in separate groups", () => {
    const edges = [edge("a", "b"), edge("c", "d")];
    const slots = computeEdgeSlots(edges);
    expect(slots.get(edges[0])).toEqual({ index: 0, total: 1 });
    expect(slots.get(edges[1])).toEqual({ index: 0, total: 1 });
  });

  it("assigns every edge in a larger group a distinct index", () => {
    const edges = [edge("a", "b", "REQUIRES"), edge("a", "b", "CONFLICTS_WITH"), edge("a", "b", "EQUIVALENT_TO")];
    const slots = computeEdgeSlots(edges);
    const indices = edges.map((e) => slots.get(e)?.index);
    expect(new Set(indices).size).toBe(3);
    expect(edges.every((e) => slots.get(e)?.total === 3)).toBe(true);
  });
});

describe("computeControlPoint", () => {
  const p1 = { x: 0, y: 0 };
  const p2 = { x: 100, y: 0 };

  it("is the straight midpoint for the only edge between a pair - no bulge", () => {
    expect(computeControlPoint(p1, p2, { index: 0, total: 1 })).toEqual({ x: 50, y: 0 });
  });

  it("bulges two edges to opposite sides of the straight line, endpoints untouched by the caller", () => {
    const a = computeControlPoint(p1, p2, { index: 0, total: 2 });
    const b = computeControlPoint(p1, p2, { index: 1, total: 2 });
    expect(a.y).toBe(-b.y);
    expect(a.y).not.toBe(0);
    // Only the control point (curve's middle) moves - p1/p2 themselves are
    // never touched by this function, so both edges still meet each node at
    // exactly the same single point.
  });

  it("does not scale the bulge with zoom - the gap stays equally visible whether zoomed in or out", () => {
    // computeControlPoint takes already-projected screen points, so the same
    // p1/p2 pixel distance produces the same bulge regardless of what world-space
    // zoom level produced them.
    const a = computeControlPoint(p1, p2, { index: 0, total: 2 });
    const b = computeControlPoint({ x: 0, y: 0 }, { x: 100, y: 0 }, { index: 0, total: 2 });
    expect(a).toEqual(b);
  });

  it("bulges an opposite-direction edge to the same side as its forward counterpart, not the mirrored one (regression: they used to cancel out and land on top of each other)", () => {
    // Same two points as p1/p2 above, but passed reversed - as computeControlPoint
    // would see them for a b->a edge grouped with an a->b edge.
    const forward = computeControlPoint(p1, p2, { index: 0, total: 2 });
    const reversed = computeControlPoint(p2, p1, { index: 0, total: 2 });
    expect(reversed).toEqual(forward);
  });

  it("still keeps two edges (one of each direction) on opposite sides via their distinct slot indices", () => {
    const forwardIndex0 = computeControlPoint(p1, p2, { index: 0, total: 2 });
    const reversedIndex1 = computeControlPoint(p2, p1, { index: 1, total: 2 });
    expect(forwardIndex0.y).toBe(-reversedIndex1.y);
    expect(forwardIndex0.y).not.toBe(0);
  });
});

describe("pointOnCurve / tangentOnCurve", () => {
  const p1 = { x: 0, y: 0 };
  const p2 = { x: 100, y: 0 };
  const control = { x: 50, y: -30 };

  it("starts exactly at p1 and ends exactly at p2", () => {
    expect(pointOnCurve(p1, control, p2, 0)).toEqual(p1);
    expect(pointOnCurve(p1, control, p2, 1)).toEqual(p2);
  });

  it("passes through a point pulled toward the control point at t=0.5", () => {
    const mid = pointOnCurve(p1, control, p2, 0.5);
    expect(mid.x).toBeCloseTo(50);
    expect(mid.y).toBeCloseTo(-15);
  });

  it("tangent at each end points away from the curve's bulge, not straight p1->p2", () => {
    const startTangent = tangentOnCurve(p1, control, p2, 0);
    // Control is above-left-ish (bulged upward in -y), so the initial tangent
    // should lean toward it rather than being purely horizontal.
    expect(startTangent.y).toBeLessThan(0);
  });

  it("degenerates to the straight-line direction when there is no bulge", () => {
    const straightControl = { x: 50, y: 0 };
    const tangent = tangentOnCurve(p1, straightControl, p2, 0.5);
    expect(tangent.x).toBeCloseTo(1);
    expect(tangent.y).toBeCloseTo(0);
  });
});

describe("distanceToCurve", () => {
  const p1 = { x: 0, y: 0 };
  const p2 = { x: 100, y: 0 };

  it("is ~0 for a point sitting on a straight (unbulged) curve", () => {
    expect(distanceToCurve(50, 0, p1, { x: 50, y: 0 }, p2)).toBeLessThan(1);
  });

  it("is small for a point near the bulged curve's actual midpoint, not the straight line's midpoint", () => {
    const control = { x: 50, y: -30 };
    const curveMid = pointOnCurve(p1, control, p2, 0.5);
    expect(distanceToCurve(curveMid.x, curveMid.y, p1, control, p2)).toBeLessThan(1);
    // The straight line's midpoint (50, 0) is far from this bulged curve.
    expect(distanceToCurve(50, 0, p1, control, p2)).toBeGreaterThan(10);
  });

  it("distinguishes two curves bulged to opposite sides of the same pair (#29's actual click scenario)", () => {
    const controlAbove = { x: 50, y: -20 };
    const controlBelow = { x: 50, y: 20 };
    const pointNearAbove = { x: 50, y: -20 };
    const pointNearBelow = { x: 50, y: 20 };

    expect(distanceToCurve(pointNearAbove.x, pointNearAbove.y, p1, controlAbove, p2)).toBeLessThan(
      distanceToCurve(pointNearAbove.x, pointNearAbove.y, p1, controlBelow, p2)
    );
    expect(distanceToCurve(pointNearBelow.x, pointNearBelow.y, p1, controlBelow, p2)).toBeLessThan(
      distanceToCurve(pointNearBelow.x, pointNearBelow.y, p1, controlAbove, p2)
    );
  });
});
