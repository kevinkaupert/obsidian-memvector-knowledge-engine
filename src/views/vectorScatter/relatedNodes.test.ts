import { describe, expect, it } from "vitest";
import { computeFocusRelatedIds, computeRelatedNodeIds } from "./relatedNodes";
import type { RelationEdge, ScatterNode } from "./types";

function node(id: string, links: string[] = []): ScatterNode {
  return { id, title: id, type: "definition", path: `${id}.md`, x: 0, y: 0, latexFormulas: [], links, content: "" };
}

function edge(srcId: string, tgtId: string): RelationEdge {
  return { srcId, tgtId, relType: "REQUIRES", desc: "", title: "", path: "" };
}

describe("computeRelatedNodeIds", () => {
  const a = node("a", ["b"]); // a links out to b
  const b = node("b");
  const c = node("c", ["a"]); // c links out to a (backlink for a)
  const d = node("d"); // only connected via Memgraph relation to a
  const e = node("e"); // unrelated
  const nodes = [a, b, c, d, e];
  const edges = [edge("a", "d")];

  it("includes notes the focus links out to", () => {
    expect(computeRelatedNodeIds(nodes, edges, a).has("b")).toBe(true);
  });

  it("includes notes that link back to the focus (backlinks)", () => {
    expect(computeRelatedNodeIds(nodes, edges, a).has("c")).toBe(true);
  });

  it("includes notes connected via a Memgraph relation edge in either direction", () => {
    expect(computeRelatedNodeIds(nodes, edges, a).has("d")).toBe(true);
    expect(computeRelatedNodeIds(nodes, edges, d).has("a")).toBe(true);
  });

  it("excludes unrelated notes", () => {
    expect(computeRelatedNodeIds(nodes, edges, a).has("e")).toBe(false);
  });
});

describe("computeFocusRelatedIds", () => {
  const a = node("a", ["b"]);
  const b = node("b");
  const nodes = [a, b];

  it("uses the selection when present", () => {
    expect(computeFocusRelatedIds(nodes, [], new Set(["a"]), null).has("b")).toBe(true);
  });

  it("falls back to the hovered node when nothing is selected", () => {
    expect(computeFocusRelatedIds(nodes, [], new Set(), a).has("b")).toBe(true);
  });

  it("returns an empty set when there is no selection or hover", () => {
    expect(computeFocusRelatedIds(nodes, [], new Set(), null).size).toBe(0);
  });
});
