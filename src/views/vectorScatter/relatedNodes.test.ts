import { describe, expect, it } from "vitest";
import { computeFocusRelationTallies, computeRelationTally } from "./relatedNodes";
import type { RelationEdge, ScatterNode } from "./types";

function node(id: string, links: string[] = []): ScatterNode {
  return { id, title: id, type: "definition", path: `${id}.md`, x: 0, y: 0, latexFormulas: [], links, content: "" };
}

function edge(srcId: string, tgtId: string): RelationEdge {
  return { srcId, tgtId, relType: "REQUIRES", desc: "", title: "", path: "", bidirectional: false };
}

describe("computeRelationTally", () => {
  const a = node("a", ["b", "g", "g"]); // a links out to b (wikilink-only), and to g twice (still one vote - dedup within a single note's own link list is not the point; direction is)
  const b = node("b");
  const c = node("c", ["a"]); // c links out to a (backlink for a) -> mutual with a below would double up
  const d = node("d"); // only connected to a via a Memgraph relation -> pure "memgraph"
  const g = node("g", ["a"]); // links to a AND a links to g (mutual) AND a Memgraph edge -> 2 wikilink votes + 1 memgraph vote
  const e = node("e"); // unrelated
  const nodes = [a, b, c, d, g, e];
  const edges = [edge("a", "d"), edge("a", "g")];

  it("tags a WikiLink-only relation with a wikilink vote and no memgraph vote", () => {
    expect(computeRelationTally(nodes, edges, a).get("b")).toEqual({ wikilink: 1, memgraph: 0 });
  });

  it("counts a backlink as a wikilink vote too", () => {
    expect(computeRelationTally(nodes, edges, a).get("c")).toEqual({ wikilink: 1, memgraph: 0 });
  });

  it("tags a Memgraph-only relation with a memgraph vote and no wikilink vote", () => {
    expect(computeRelationTally(nodes, edges, a).get("d")).toEqual({ wikilink: 0, memgraph: 1 });
    expect(computeRelationTally(nodes, edges, d).get("a")).toEqual({ wikilink: 0, memgraph: 1 });
  });

  it("sums a mutual WikiLink (2 votes) plus a Memgraph edge (1 vote)", () => {
    expect(computeRelationTally(nodes, edges, a).get("g")).toEqual({ wikilink: 2, memgraph: 1 });
  });

  it("does not include unrelated notes", () => {
    expect(computeRelationTally(nodes, edges, a).has("e")).toBe(false);
  });
});

describe("computeFocusRelationTallies", () => {
  const a = node("a", ["b"]);
  const b = node("b");
  const nodes = [a, b];

  it("uses the selection when present", () => {
    expect(computeFocusRelationTallies(nodes, [], new Set(["a"]), null).get("b")).toEqual({ wikilink: 1, memgraph: 0 });
  });

  it("falls back to the hovered node when nothing is selected", () => {
    expect(computeFocusRelationTallies(nodes, [], new Set(), a).get("b")).toEqual({ wikilink: 1, memgraph: 0 });
  });

  it("returns an empty map when there is no selection or hover", () => {
    expect(computeFocusRelationTallies(nodes, [], new Set(), null).size).toBe(0);
  });

  it("sums votes across multiple selected focus notes", () => {
    const x = node("x", ["z"]);
    const y = node("y");
    const z = node("z");
    const multi = [x, y, z];
    const edges = [edge("y", "z")];
    const merged = computeFocusRelationTallies(multi, edges, new Set(["x", "y"]), null);
    expect(merged.get("z")).toEqual({ wikilink: 1, memgraph: 1 });
  });
});
