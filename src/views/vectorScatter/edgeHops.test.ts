import { describe, expect, it } from "vitest";
import { computeHopReachableNodeIds } from "./edgeHops";
import type { RelationEdge, ScatterNode } from "./types";

function node(id: string): ScatterNode {
  return { id, title: id, type: "definition", path: `${id}.md`, x: 0, y: 0, latexFormulas: [], links: [], content: "" };
}

function edge(srcId: string, tgtId: string): RelationEdge {
  return { srcId, tgtId, relType: "REQUIRES", desc: "", title: "", path: "", bidirectional: false };
}

describe("computeHopReachableNodeIds", () => {
  // chain: a -> b -> c -> d
  const nodes = [node("a"), node("b"), node("c"), node("d")];
  const nodeMap = new Map(nodes.map((n) => [n.id.toLowerCase(), n]));
  const edges = [edge("a", "b"), edge("b", "c"), edge("c", "d")];

  it("returns just the seed for hops=1", () => {
    expect(computeHopReachableNodeIds(edges, nodeMap, new Set(["a"]), 1)).toEqual(new Set(["a"]));
  });

  it("reaches one hop further for hops=2", () => {
    expect(computeHopReachableNodeIds(edges, nodeMap, new Set(["a"]), 2)).toEqual(new Set(["a", "b"]));
  });

  it("reaches two hops further for hops=3", () => {
    expect(computeHopReachableNodeIds(edges, nodeMap, new Set(["a"]), 3)).toEqual(new Set(["a", "b", "c"]));
  });

  it("stops expanding once the frontier is exhausted", () => {
    expect(computeHopReachableNodeIds(edges, nodeMap, new Set(["a"]), 10)).toEqual(new Set(["a", "b", "c", "d"]));
  });

  it("returns an empty set for an empty seed", () => {
    expect(computeHopReachableNodeIds(edges, nodeMap, new Set(), 3).size).toBe(0);
  });

  it("expands from multiple seeds independently", () => {
    expect(computeHopReachableNodeIds(edges, nodeMap, new Set(["a", "d"]), 2)).toEqual(new Set(["a", "d", "b", "c"]));
  });
});
