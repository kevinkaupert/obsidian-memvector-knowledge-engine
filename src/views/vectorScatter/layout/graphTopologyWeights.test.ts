import { describe, expect, it } from "vitest";
import { BASELINE_WEIGHT, computeGraphTopologyWeights } from "./graphTopologyWeights";
import type { RelationEdge, ScatterNode } from "../types";

function node(id: string, links: string[] = []): ScatterNode {
  return { id, basenameKey: id, title: id, type: "definition", path: `${id}.md`, x: 0, y: 0, latexFormulas: [], links, content: "" };
}

function edge(srcId: string, tgtId: string, relType: string): RelationEdge {
  return { srcId, tgtId, relType, desc: "", title: "", path: "", bidirectional: false };
}

describe("computeGraphTopologyWeights", () => {
  it("weights a direct typed relation higher than a plain WikiLink", () => {
    // chain: a -[REQUIRES]-> b -(wikilink)- c
    const nodes = [node("a"), node("b", ["c"]), node("c")];
    const edges = [edge("a", "b", "REQUIRES")];
    const { conn } = computeGraphTopologyWeights(nodes, edges, true);
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
    const { conn } = computeGraphTopologyWeights(nodes, edges, true);
    expect(conn[0][1]).toBeCloseTo(1.3);
  });

  it("matches relation edges case-insensitively when node IDs or paths have capital letters", () => {
    const nodes = [node("Math/LinearAlgebra.md"), node("Math/VectorSpaces.md")];
    const edges = [edge("Math/LinearAlgebra.md", "Math/VectorSpaces.md", "REQUIRES")];
    const { conn } = computeGraphTopologyWeights(nodes, edges);
    expect(conn[0][1]).toBe(1.0);
  });

  it("treats INDEPENDENT_OF as baseline neutral weight instead of strong attraction (#68)", () => {
    const nodes = [node("a"), node("b")];
    const edges = [edge("a", "b", "INDEPENDENT_OF")];
    const { conn, repel } = computeGraphTopologyWeights(nodes, edges);
    expect(conn[0][1]).toBe(BASELINE_WEIGHT);
    expect(repel.has("0-1")).toBe(false);
  });

  it("omits WikiLink attraction by default (Issue #100)", () => {
    const nodes = [node("a", ["b"]), node("b")];
    const { conn } = computeGraphTopologyWeights(nodes, []);
    expect(conn[0][1]).toBe(BASELINE_WEIGHT);
  });

  it("omits WikiLink attraction when the toggle is explicitly off (Issue #100)", () => {
    const nodes = [node("a", ["b"]), node("b")];
    const { conn } = computeGraphTopologyWeights(nodes, [], false);
    expect(conn[0][1]).toBe(BASELINE_WEIGHT);
  });

  it("applies WikiLink attraction when the toggle is on (Issue #100)", () => {
    const nodes = [node("a", ["b"]), node("b")];
    const { conn } = computeGraphTopologyWeights(nodes, [], true);
    expect(conn[0][1]).toBe(0.7);
  });

  it("keeps typed relation weights independent of the WikiLink toggle (Issue #100)", () => {
    const nodes = [node("a", ["b"]), node("b")];
    const edges = [edge("a", "b", "REQUIRES")];
    expect(computeGraphTopologyWeights(nodes, edges, false).conn[0][1]).toBe(1.0);
    expect(computeGraphTopologyWeights(nodes, edges, true).conn[0][1]).toBe(1.0);
  });
});
