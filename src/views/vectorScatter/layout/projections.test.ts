import { describe, expect, it } from "vitest";
import type { RelationEdge, ScatterNode } from "../types";
import { applyGraphVectorProjection } from "./projections";

function makeNode(id: string): ScatterNode {
  return {
    id,
    title: id,
    path: `${id}.md`,
    x: 0,
    y: 0,
    type: "concept",
    latexFormulas: [],
    links: [],
    content: id,
  };
}

describe("applyGraphVectorProjection", () => {
  it("places highly similar nodes closer together than unrelated nodes", () => {
    const nodeA = makeNode("A");
    const nodeB = makeNode("B");
    const nodeC = makeNode("C");
    const nodes = [nodeA, nodeB, nodeC];

    // Similarity matrix: A and B are very similar (0.9), C is distant from both (0.0)
    const matrix = [
      [1.0, 0.9, 0.0],
      [0.9, 1.0, 0.0],
      [0.0, 0.0, 1.0],
    ];

    applyGraphVectorProjection({
      nodes,
      matrix,
      nodeSpacing: 150,
      cloudSpacing: 300,
      relationEdges: [],
    });

    const distAB = Math.hypot(nodeA.x - nodeB.x, nodeA.y - nodeB.y);
    const distAC = Math.hypot(nodeA.x - nodeC.x, nodeA.y - nodeC.y);
    const distBC = Math.hypot(nodeB.x - nodeC.x, nodeB.y - nodeC.y);

    expect(distAB).toBeLessThan(distAC);
    expect(distAB).toBeLessThan(distBC);
  });

  it("pushes CONFLICTS_WITH pairs further apart", () => {
    const nodeA = makeNode("A");
    const nodeB = makeNode("B");
    const nodes = [nodeA, nodeB];

    const matrix = [
      [1.0, 0.5],
      [0.5, 1.0],
    ];

    const relationEdges: RelationEdge[] = [
      {
        srcId: "a",
        tgtId: "b",
        relType: "CONFLICTS_WITH",
        desc: "Contradiction",
        title: "A contradicts B",
        path: "wiki/relations/rel-a-to-b.md",
        bidirectional: true,
      },
    ];

    applyGraphVectorProjection({
      nodes,
      matrix,
      nodeSpacing: 150,
      cloudSpacing: 300,
      relationEdges,
    });

    const distAB = Math.hypot(nodeA.x - nodeB.x, nodeA.y - nodeB.y);
    expect(distAB).toBeGreaterThan(150);
  });
});
