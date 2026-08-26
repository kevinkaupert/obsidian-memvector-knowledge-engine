import { describe, expect, it } from "vitest";
import { BASELINE_WEIGHT, computeGraphTopologyWeights } from "./graphTopologyWeights";
import type { RelationEdge, ScatterNode } from "../types";

function node(id: string, links: string[] = []): ScatterNode {
  return { id, title: id, type: "definition", path: `${id}.md`, x: 0, y: 0, latexFormulas: [], links, content: "" };
}

function edge(srcId: string, tgtId: string, relType: string): RelationEdge {
  return { srcId, tgtId, relType, desc: "", title: "", path: "", bidirectional: false };
}

describe("computeGraphTopologyWeights", () => {
  it("weights a direct typed relation higher than a plain WikiLink", () => {
    // chain: a -[REQUIRES]-> b -(wikilink)- c
    const nodes = [node("a"), node("b", ["c"]), node("c")];
    const edges = [edge("a", "b", "REQUIRES")];
    const { conn } = computeGraphTopologyWeights(nodes, edges);
    expect(conn[0][1]).toBe(1.0);
    expect(conn[1][2]).toBe(0.7);
  });

  it("pulls EQUIVALENT_TO and ANALOGOUS_TO closer than a default relation", () => {
    const nodes = [node("a"), node("b"), node("c")];
    const edges = [edge("a", "b", "EQUIVALENT_TO")];
    const { conn } = computeGraphTopologyWeights(nodes, edges);
    expect(conn[0][1]).toBeGreaterThan(1.0);
  });

  it("gives a decayed but real attraction to a note two hops away instead of the baseline", () => {
    const nodes = [node("a"), node("b"), node("c")];
    const edges = [edge("a", "b", "REQUIRES"), edge("b", "c", "REQUIRES")];
    const { conn } = computeGraphTopologyWeights(nodes, edges);
    expect(conn[0][2]).toBeGreaterThan(BASELINE_WEIGHT);
    expect(conn[0][2]).toBeLessThan(conn[0][1]);
  });

  it("falls back to the baseline weight beyond the hop cap or when unreachable", () => {
    const nodes = [node("a"), node("b"), node("far")];
    const edges = [edge("a", "b", "REQUIRES")];
    const { conn } = computeGraphTopologyWeights(nodes, edges);
    expect(conn[0][2]).toBe(BASELINE_WEIGHT);
  });

  it("marks a direct CONFLICTS_WITH edge for repulsion instead of attraction", () => {
    const nodes = [node("a"), node("b")];
    const edges = [edge("a", "b", "CONFLICTS_WITH")];
    const { conn, repel } = computeGraphTopologyWeights(nodes, edges);
    expect(repel.has("0-1")).toBe(true);
    expect(conn[0][1]).toBe(BASELINE_WEIGHT);
  });

  it("uses the stronger of a WikiLink and a typed relation when both exist between the same pair", () => {
    const nodes = [node("a", ["b"]), node("b")];
    const edges = [edge("a", "b", "EQUIVALENT_TO")];
    const { conn } = computeGraphTopologyWeights(nodes, edges);
    expect(conn[0][1]).toBeCloseTo(1.3);
  });
});
