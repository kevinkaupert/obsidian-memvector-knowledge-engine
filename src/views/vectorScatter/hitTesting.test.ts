import { describe, expect, it } from "vitest";
import { hitTestEdge } from "./hitTesting";
import type { RelationEdge, ScatterNode } from "./types";

function node(id: string, x: number, y: number): ScatterNode {
  return { id, basenameKey: id, title: id, type: "concept", path: `${id}.md`, x, y, latexFormulas: [], links: [], content: "" };
}

function edge(srcId: string, tgtId: string, relType: string): RelationEdge {
  return { srcId, tgtId, relType, desc: "", title: "", path: "", bidirectional: false };
}

describe("hitTestEdge with multiple relations between the same pair (#29)", () => {
  it("can reach both relations between the same pair, not only whichever is checked first", () => {
    const nodes = [node("a", 0, 0), node("b", 100, 0)];
    const edges = [edge("a", "b", "REQUIRES"), edge("a", "b", "CONFLICTS_WITH")];
    const pan = { x: 0, y: 0 };
    const zoom = 1;

    // Both edges connect the same two points; a click needs to land on each
    // one's own fanned-out offset line to find it, not just the raw midline.
    const foundAtOffsetAbove = hitTestEdge(nodes, edges, new Set(), 0, 50, -5, zoom, pan, 8);
    const foundAtOffsetBelow = hitTestEdge(nodes, edges, new Set(), 0, 50, 5, zoom, pan, 8);

    expect(foundAtOffsetAbove).not.toBeNull();
    expect(foundAtOffsetBelow).not.toBeNull();
    expect(foundAtOffsetAbove?.relType).not.toBe(foundAtOffsetBelow?.relType);
  });

  it("still finds a lone edge on the raw (un-offset) midline, unaffected by the grouping logic", () => {
    const nodes = [node("a", 0, 0), node("b", 100, 0)];
    const edges = [edge("a", "b", "REQUIRES")];
    const found = hitTestEdge(nodes, edges, new Set(), 0, 50, 0, 1, { x: 0, y: 0 }, 8);
    expect(found?.relType).toBe("REQUIRES");
  });
});
