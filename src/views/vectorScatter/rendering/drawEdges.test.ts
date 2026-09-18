import { describe, expect, it } from "vitest";
import {
  CANONICAL_EDGE_COLORS,
  EDGE_COLOR_PALETTE,
  NEUTRAL_EDGE,
  colorForLabel,
  resolveEdgeColor,
} from "./drawEdges";

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
});
