import { describe, expect, it } from "vitest";
import {
  CANONICAL_EDGE_COLORS,
  EDGE_COLOR_PALETTE,
  NEUTRAL_EDGE,
  colorForLabel,
  drawEdges,
  resolveEdgeColor,
} from "./drawEdges";
import type { RelationEdge, ScatterNode } from "../types";

describe("drawEdges color resolution (Issue #62)", () => {
  const EXPECTED_CANONICAL_LABELS = [
    "IMPLIES",
    "EQUIVALENT_TO",
    "CONFLICTS_WITH",
    "REFUTES",
    "REQUIRES",
    "GENERALIZES",
    "SPECIALIZES",
    "EXTENDS",
    "CONSTRUCTS",
    "EMBEDS_IN",
    "REDUCES_TO",
    "INDEPENDENT_OF",
    "ANALOGOUS_TO",
  ];

  describe("canonical Cypher relation colors", () => {
    it("defines exactly 13 canonical relation labels", () => {
      expect(Object.keys(CANONICAL_EDGE_COLORS)).toHaveLength(13);
      for (const label of EXPECTED_CANONICAL_LABELS) {
        expect(CANONICAL_EDGE_COLORS).toHaveProperty(label);
      }
    });

    it("assigns distinct, unique colors to all 13 canonical labels", () => {
      const colorSet = new Set(Object.values(CANONICAL_EDGE_COLORS));
      expect(colorSet.size).toBe(13);
    });

    it("colorForLabel resolves each canonical label to its defined color", () => {
      for (const label of EXPECTED_CANONICAL_LABELS) {
        expect(colorForLabel(label)).toBe(CANONICAL_EDGE_COLORS[label]);
      }
    });

    it("resolves canonical labels case-insensitively and with trimmed whitespace", () => {
      expect(colorForLabel("requires")).toBe(CANONICAL_EDGE_COLORS.REQUIRES);
      expect(colorForLabel("  specializes  ")).toBe(CANONICAL_EDGE_COLORS.SPECIALIZES);
      expect(colorForLabel("implies")).toBe(CANONICAL_EDGE_COLORS.IMPLIES);
      expect(colorForLabel("Conflicts_With")).toBe(CANONICAL_EDGE_COLORS.CONFLICTS_WITH);
    });
  });

  describe("custom and fallback relation colors", () => {
    it("returns NEUTRAL_EDGE for empty or null labels", () => {
      expect(colorForLabel("")).toBe(NEUTRAL_EDGE);
      expect(colorForLabel(null as unknown as string)).toBe(NEUTRAL_EDGE);
    });

    it("deterministically maps custom labels into EDGE_COLOR_PALETTE", () => {
      const customColor1 = colorForLabel("CUSTOM_RELATION_A");
      const customColor2 = colorForLabel("CUSTOM_RELATION_A");
      expect(customColor1).toBe(customColor2);
      expect(EDGE_COLOR_PALETTE).toContain(customColor1);

      const neutralElemColor = colorForLabel("NEUTRAL_ELEMENT_OF");
      expect(EDGE_COLOR_PALETTE).toContain(neutralElemColor);
    });
  });

  describe("resolveEdgeColor by visual style", () => {
    const themeAccent = "#7c3aed";

    it("resolves distinct palette color in default 'ink' style", () => {
      const requiresColor = resolveEdgeColor("REQUIRES", "ink", themeAccent);
      const impliesColor = resolveEdgeColor("IMPLIES", "ink", themeAccent);
      expect(requiresColor).toBe(CANONICAL_EDGE_COLORS.REQUIRES);
      expect(impliesColor).toBe(CANONICAL_EDGE_COLORS.IMPLIES);
      expect(requiresColor).not.toBe(themeAccent);
      expect(requiresColor).not.toBe(impliesColor);
    });

    it("resolves distinct palette color in 'muted' style", () => {
      const color = resolveEdgeColor("CONSTRUCTS", "muted", themeAccent);
      expect(color).toBe(CANONICAL_EDGE_COLORS.CONSTRUCTS);
      expect(color).not.toBe(themeAccent);
    });

    it("resolves to themeAccent uniformly when style is 'monochrome'", () => {
      expect(resolveEdgeColor("REQUIRES", "monochrome", themeAccent)).toBe(themeAccent);
      expect(resolveEdgeColor("IMPLIES", "monochrome", themeAccent)).toBe(themeAccent);
      expect(resolveEdgeColor("CUSTOM_EDGE", "monochrome", themeAccent)).toBe(themeAccent);
    });
  });

  describe("drawEdges viewport culling (Issue #158)", () => {
    function fakeEdgeCtx() {
      let strokes = 0;
      const ctx = {
        save() {},
        restore() {},
        beginPath() {},
        moveTo() {},
        quadraticCurveTo() {},
        stroke() { strokes++; },
        lineTo() {},
        closePath() {},
        fill() {},
        fillText() {},
        set strokeStyle(_: any) {},
        set lineWidth(_: any) {},
        set globalAlpha(_: any) {},
        set fillStyle(_: any) {},
        set font(_: any) {},
        set textAlign(_: any) {},
        set textBaseline(_: any) {},
      };
      return { ctx: ctx as unknown as CanvasRenderingContext2D, getStrokes: () => strokes };
    }

    function node(id: string, x: number, y: number): ScatterNode {
      return { id, basenameKey: id, title: id, type: "concept", path: `${id}.md`, x, y, latexFormulas: [], links: [], content: "" };
    }

    function makeEdge(srcId: string, tgtId: string, relType: string): RelationEdge {
      return { srcId, tgtId, relType, desc: "", title: "", path: "", bidirectional: false };
    }

    it("skips edge drawing when both endpoints are outside the viewport on the same side", () => {
      const a = node("a", 2000, 2000);
      const b = node("b", 2100, 2100);
      const nodeMap = new Map([["a", a], ["b", b]]);
      const edges: RelationEdge[] = [makeEdge("a", "b", "REQUIRES")];
      const vp = { minX: 0, maxX: 500, minY: 0, maxY: 500 };
      const { ctx, getStrokes } = fakeEdgeCtx();

      drawEdges(ctx, nodeMap, edges, new Set(), null, null, 0, 1, { x: 0, y: 0 }, "#fff", "#0af", "monochrome", vp);
      expect(getStrokes()).toBe(0);
    });

    it("draws edge when at least one endpoint or the span intersects the viewport", () => {
      const a = node("a", 100, 100);
      const b = node("b", 200, 200);
      const nodeMap = new Map([["a", a], ["b", b]]);
      const edges: RelationEdge[] = [makeEdge("a", "b", "REQUIRES")];
      const vp = { minX: 0, maxX: 500, minY: 0, maxY: 500 };
      const { ctx, getStrokes } = fakeEdgeCtx();

      drawEdges(ctx, nodeMap, edges, new Set(), null, null, 0, 1, { x: 0, y: 0 }, "#fff", "#0af", "monochrome", vp);
      expect(getStrokes()).toBeGreaterThan(0);
    });

    it("draws all edges when viewport parameter is omitted for backward compatibility", () => {
      const a = node("a", 2000, 2000);
      const b = node("b", 2100, 2100);
      const nodeMap = new Map([["a", a], ["b", b]]);
      const edges: RelationEdge[] = [makeEdge("a", "b", "REQUIRES")];
      const { ctx, getStrokes } = fakeEdgeCtx();

      drawEdges(ctx, nodeMap, edges, new Set(), null, null, 0, 1, { x: 0, y: 0 }, "#fff", "#0af", "monochrome");
      expect(getStrokes()).toBeGreaterThan(0);
    });
  });
});
