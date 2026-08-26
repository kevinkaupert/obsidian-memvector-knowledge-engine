import { describe, expect, it } from "vitest";
import { computeFocusRelatedKinds, computeRelatedNodeKinds } from "./relatedNodes";
import type { RelationEdge, ScatterNode } from "./types";

function node(id: string, links: string[] = []): ScatterNode {
  return { id, title: id, type: "definition", path: `${id}.md`, x: 0, y: 0, latexFormulas: [], links, content: "" };
}

function edge(srcId: string, tgtId: string): RelationEdge {
  return { srcId, tgtId, relType: "REQUIRES", desc: "", title: "", path: "" };
}

describe("computeRelatedNodeKinds", () => {
  const a = node("a", ["b", "g"]); // a links out to b (wikilink-only) and g (also memgraph-related -> "both")
  const b = node("b");
  const c = node("c", ["a"]); // c links out to a (backlink for a)
  const d = node("d"); // only connected to a via a Memgraph relation -> "memgraph"
  const g = node("g"); // connected to a via both a WikiLink and a Memgraph relation -> "both"
  const e = node("e"); // unrelated
  const nodes = [a, b, c, d, g, e];
  const edges = [edge("a", "d"), edge("a", "g")];

  it("tags a WikiLink-only relation as 'wikilink'", () => {
    expect(computeRelatedNodeKinds(nodes, edges, a).get("b")).toBe("wikilink");
  });

  it("tags a backlink as 'wikilink' too", () => {
    expect(computeRelatedNodeKinds(nodes, edges, a).get("c")).toBe("wikilink");
  });

  it("tags a Memgraph-only relation as 'memgraph'", () => {
    expect(computeRelatedNodeKinds(nodes, edges, a).get("d")).toBe("memgraph");
    expect(computeRelatedNodeKinds(nodes, edges, d).get("a")).toBe("memgraph");
  });

  it("tags a note related via both channels as 'both'", () => {
    expect(computeRelatedNodeKinds(nodes, edges, a).get("g")).toBe("both");
  });

  it("does not include unrelated notes", () => {
    expect(computeRelatedNodeKinds(nodes, edges, a).has("e")).toBe(false);
  });
});

describe("computeFocusRelatedKinds", () => {
  const a = node("a", ["b"]);
  const b = node("b");
  const nodes = [a, b];

  it("uses the selection when present", () => {
    expect(computeFocusRelatedKinds(nodes, [], new Set(["a"]), null).get("b")).toBe("wikilink");
  });

  it("falls back to the hovered node when nothing is selected", () => {
    expect(computeFocusRelatedKinds(nodes, [], new Set(), a).get("b")).toBe("wikilink");
  });

  it("returns an empty map when there is no selection or hover", () => {
    expect(computeFocusRelatedKinds(nodes, [], new Set(), null).size).toBe(0);
  });

  it("escalates to 'both' when merging a wikilink hit with a memgraph hit across selected focus notes", () => {
    const x = node("x", ["z"]);
    const y = node("y");
    const z = node("z");
    const multi = [x, y, z];
    const edges = [edge("y", "z")];
    const merged = computeFocusRelatedKinds(multi, edges, new Set(["x", "y"]), null);
    expect(merged.get("z")).toBe("both");
  });
});
