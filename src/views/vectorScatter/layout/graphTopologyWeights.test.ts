import { describe, expect, it } from "vitest";
import { relationSignal } from "./signals";
import type { RelationEdge, ScatterNode } from "../types";

function node(id: string, links: string[] = []): ScatterNode {
  return { id, basenameKey: id, title: id, type: "definition", path: `${id}.md`, x: 0, y: 0, latexFormulas: [], links, content: "" };
}

function edge(srcId: string, tgtId: string, relType: string): RelationEdge {
  return { srcId, tgtId, relType, desc: "", title: "", path: "", bidirectional: false };
}

describe("relationSignal (Plan 0005: typed relations only, no WikiLinks, no hops)", () => {


  it("pulls EQUIVALENT_TO and ANALOGOUS_TO closer than a default relation", () => {
    const nodes = [node("a"), node("b"), node("c")];
    const edges = [edge("a", "b", "EQUIVALENT_TO")];
    const { weight } = relationSignal(nodes, edges);
    expect(weight[0][1]).toBeGreaterThan(1.0);
  });







  it("marks a direct CONFLICTS_WITH edge for repulsion instead of attraction", () => {
    const nodes = [node("a"), node("b")];
    const edges = [edge("a", "b", "CONFLICTS_WITH")];
    const { weight, repel } = relationSignal(nodes, edges);
    expect(repel.has("0-1")).toBe(true);
    expect(weight[0][1]).toBe(0);
  });



  it("matches relation edges case-insensitively when node IDs or paths have capital letters", () => {
    const nodes = [node("Math/LinearAlgebra.md"), node("Math/VectorSpaces.md")];
    const edges = [edge("Math/LinearAlgebra.md", "Math/VectorSpaces.md", "REQUIRES")];
    const { weight } = relationSignal(nodes, edges);
    expect(weight[0][1]).toBe(1.0);
  });

  it("treats INDEPENDENT_OF as a near-neutral weight instead of strong attraction (#68)", () => {
    const nodes = [node("a"), node("b")];
    const edges = [edge("a", "b", "INDEPENDENT_OF")];
    const { weight, repel } = relationSignal(nodes, edges);
    expect(weight[0][1]).toBe(0.05); // bundled near-neutral weight, below the 0.15 attraction threshold
    expect(repel.has("0-1")).toBe(false);
  });









  describe("vocabulary-driven weights (Issue #119, ADR-0002)", () => {
    const vocab = [
      { key: "k1", label: "MY_CLOSE", term: "my close", category: "Test", bidirectional: false, reversed: false, weight: 2.5 },
      { key: "k2", label: "MY_REPEL", term: "my repel", category: "Test", bidirectional: false, reversed: false, repels: true },
      { key: "k3", label: "MY_NEUTRAL", term: "my neutral", category: "Test", bidirectional: false, reversed: false, weight: 0.05 },
      { key: "k4", label: "MY_PLAIN", term: "my plain", category: "Test", bidirectional: false, reversed: false },
    ];

    it("resolves per-label attraction weights from the loaded vocabulary", () => {
      const nodes = [node("a"), node("b"), node("c"), node("d")];
      const edges = [
        edge("a", "b", "MY_CLOSE"),
        edge("a", "c", "MY_NEUTRAL"),
        edge("a", "d", "MY_PLAIN"),
      ];
      const { weight } = relationSignal(nodes, edges, vocab);
      expect(weight[0][1]).toBe(2.5);
      expect(weight[0][2]).toBe(0.05);
      expect(weight[0][3]).toBe(1.0);
    });

    it("marks repels: true labels for repulsion and does not attract", () => {
      const nodes = [node("a"), node("b")];
      const edges = [edge("a", "b", "MY_REPEL")];
      const { weight, repel } = relationSignal(nodes, edges, vocab);
      expect(repel.has("0-1")).toBe(true);
      expect(weight[0][1]).toBe(0);
    });

    it("overrides the bundled default when the vault vocabulary redefines a label", () => {
      const nodes = [node("a"), node("b")];
      const edges = [edge("a", "b", "EQUIVALENT_TO")];
      const overridden = [{ key: "k", label: "EQUIVALENT_TO", term: "equivalent to", category: "Test", bidirectional: true, reversed: false, weight: 0.2 }];
      const { weight } = relationSignal(nodes, edges, overridden);
      expect(weight[0][1]).toBe(0.2);
    });

    it("resolves labels case-insensitively against the vocabulary", () => {
      const nodes = [node("a"), node("b")];
      const edges = [edge("a", "b", "my_close")];
      const { weight } = relationSignal(nodes, edges, vocab);
      expect(weight[0][1]).toBe(2.5);
    });

    it("falls back to the default weight for labels absent from the vocabulary", () => {
      const nodes = [node("a"), node("b")];
      const edges = [edge("a", "b", "UNKNOWN_LABEL")];
      const { weight, repel } = relationSignal(nodes, edges, vocab);
      expect(weight[0][1]).toBe(1.0);
      expect(repel.has("0-1")).toBe(false);
    });
  });

  describe("bundled layout fallback for labels missing from the active vocabulary", () => {
    /** A single-label preset from another domain - a user who switched away from STEM. */
    const lawOnly = [
      { key: "lawRegulates", label: "REGULATES", term: "regulates", category: "Legislation", bidirectional: false, reversed: false },
    ];

    it("keeps CONFLICTS_WITH repelling after a preset switch drops the label", () => {
      const nodes = [node("a"), node("b")];
      const { weight, repel } = relationSignal(nodes, [edge("a", "b", "CONFLICTS_WITH")], lawOnly);
      expect(repel.has("0-1")).toBe(true);
      expect(weight[0][1]).toBe(0);
    });

    it("keeps INDEPENDENT_OF at the neutral baseline instead of a full pull (Issue #68)", () => {
      const nodes = [node("a"), node("b")];
      const { weight } = relationSignal(nodes, [edge("a", "b", "INDEPENDENT_OF")], lawOnly);
      expect(weight[0][1]).toBe(0.05);
    });

    it("keeps EQUIVALENT_TO's close pull after a preset switch drops the label", () => {
      const nodes = [node("a"), node("b")];
      const { weight } = relationSignal(nodes, [edge("a", "b", "EQUIVALENT_TO")], lawOnly);
      expect(weight[0][1]).toBe(1.3);
    });

    it("still lets the active vocabulary override a bundled label it does define", () => {
      const nodes = [node("a"), node("b")];
      const redefined = [
        ...lawOnly,
        { key: "k", label: "CONFLICTS_WITH", term: "conflicts with", category: "Legal", bidirectional: true, reversed: false, weight: 0.9 },
      ];
      const { weight, repel } = relationSignal(nodes, [edge("a", "b", "CONFLICTS_WITH")], redefined);
      expect(repel.has("0-1")).toBe(false);
      expect(weight[0][1]).toBe(0.9);
    });
  });
});
