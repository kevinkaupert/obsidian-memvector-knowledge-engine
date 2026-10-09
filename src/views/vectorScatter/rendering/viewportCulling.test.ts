import { describe, expect, it } from "vitest";
import { computeWorldViewport, isEdgeInViewport, isNodeInViewport, type ViewportBounds } from "./viewportCulling";
import type { ScatterNode } from "../types";
import { computeControlPoint } from "../edgeGrouping";

function node(id: string, x: number, y: number): ScatterNode {
  return { id, title: id, path: `${id}.md`, x, y, type: "concept", basenameKey: id.toLowerCase(), latexFormulas: [], links: [], content: "" };
}

describe("viewportCulling (Issue #63 Phase 2, Issue #158)", () => {
  describe("computeWorldViewport", () => {
    it("computes world coordinates with default margin at 1x zoom", () => {
      const vp = computeWorldViewport(800, 600, 1, { x: 0, y: 0 }, 100);
      expect(vp.minX).toBe(-100);
      expect(vp.maxX).toBe(900);
      expect(vp.minY).toBe(-100);
      expect(vp.maxY).toBe(700);
    });

    it("scales margin and bounds inversely with zoom and offsets with pan", () => {
      // Zoom 2x, pan offset (100, 50), margin 100px (50 world units)
      const vp = computeWorldViewport(800, 600, 2, { x: 100, y: 50 }, 100);
      expect(vp.minX).toBe(-100);
      expect(vp.maxX).toBe(400);
      expect(vp.minY).toBe(-75);
      expect(vp.maxY).toBe(325);
    });

    it("handles zero or negative zoom gracefully without throwing", () => {
      const vp = computeWorldViewport(800, 600, 0, { x: 0, y: 0 });
      expect(Number.isFinite(vp.minX)).toBe(true);
      expect(Number.isFinite(vp.maxX)).toBe(true);
    });
  });

  describe("isNodeInViewport", () => {
    const vp: ViewportBounds = { minX: -100, maxX: 500, minY: -100, maxY: 400 };

    it("returns true for a node inside the viewport bounds", () => {
      expect(isNodeInViewport(node("center", 200, 200), vp)).toBe(true);
      expect(isNodeInViewport(node("edge", -100, 400), vp)).toBe(true);
    });

    it("returns false for a node outside any of the 4 bounds", () => {
      expect(isNodeInViewport(node("left", -150, 200), vp)).toBe(false);
      expect(isNodeInViewport(node("right", 550, 200), vp)).toBe(false);
      expect(isNodeInViewport(node("top", 200, -120), vp)).toBe(false);
      expect(isNodeInViewport(node("bottom", 200, 450), vp)).toBe(false);
    });

    it("keeps a node just outside the margin whose label still reaches into view (#163)", () => {
      // 150px left of the bound: the dot is culled by a center-only test, but its label reaches 160px.
      expect(isNodeInViewport(node("left", -250, 200), vp)).toBe(false);
      expect(isNodeInViewport(node("left", -250, 200), vp, 1)).toBe(true);
      expect(isNodeInViewport(node("top", 200, -120), vp, 1)).toBe(true);
    });

    it("scales the label reach with zoom and still culls nodes far outside (#163)", () => {
      // Zoomed in 2x, the same screen reach covers half the world distance.
      expect(isNodeInViewport(node("left", -250, 200), vp, 2)).toBe(false);
      expect(isNodeInViewport(node("far", -1000, 200), vp, 1)).toBe(false);
    });
  });

  describe("isEdgeInViewport", () => {
    const vp: ViewportBounds = { minX: 0, maxX: 1000, minY: 0, maxY: 800 };

    it("returns true when both nodes are inside the viewport", () => {
      const a = node("a", 100, 100);
      const b = node("b", 200, 200);
      expect(isEdgeInViewport(a, b, vp)).toBe(true);
    });

    it("returns true when one node is inside and one is outside", () => {
      const inside = node("in", 500, 400);
      const outside = node("out", 1500, 400);
      expect(isEdgeInViewport(inside, outside, vp)).toBe(true);
      expect(isEdgeInViewport(outside, inside, vp)).toBe(true);
    });

    it("returns true when the edge spans completely across the viewport", () => {
      const left = node("left", -500, 400);
      const right = node("right", 1500, 400);
      expect(isEdgeInViewport(left, right, vp)).toBe(true);

      const top = node("top", 500, -500);
      const bottom = node("bottom", 500, 1500);
      expect(isEdgeInViewport(top, bottom, vp)).toBe(true);
    });

    it("returns false when both endpoints are on the same outside side", () => {
      // Both left
      expect(isEdgeInViewport(node("a", -200, 100), node("b", -100, 300), vp)).toBe(false);
      // Both right
      expect(isEdgeInViewport(node("a", 1200, 100), node("b", 1500, 300), vp)).toBe(false);
      // Both top
      expect(isEdgeInViewport(node("a", 100, -200), node("b", 300, -50), vp)).toBe(false);
      // Both bottom
      expect(isEdgeInViewport(node("a", 100, 900), node("b", 300, 1200), vp)).toBe(false);
    });

    it("keeps a fanned edge whose bulge enters the viewport although both endpoints are above it (#163)", () => {
      const a = node("a", 100, -150);
      const b = node("b", 900, -150);
      expect(isEdgeInViewport(a, b, vp)).toBe(false);
      // Outermost slot of a large bundle at 1x zoom: the control point dips well below y = 0.
      const control = computeControlPoint(a, b, { index: 39, total: 40 });
      expect(control.y).toBeGreaterThan(0);
      expect(isEdgeInViewport(a, b, vp, control)).toBe(true);
    });

    it("still culls a fanned edge whose bulge points away from the viewport (#163)", () => {
      const a = node("a", 100, -150);
      const b = node("b", 900, -150);
      const control = computeControlPoint(a, b, { index: 0, total: 40 });
      expect(control.y).toBeLessThan(-150);
      expect(isEdgeInViewport(a, b, vp, control)).toBe(false);
    });
  });
});
