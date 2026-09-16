import { describe, expect, it } from "vitest";
import type { RelationEdge, ScatterNode } from "../types";
import { applyGraphVectorProjection } from "./projections";

function makeNode(id: string): ScatterNode {
  return {
    id,
    basenameKey: id,
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

  it("clusters nodes by topic when similarity is in realistic anisotropic range [0.65, 0.85]", () => {
    const nodes = [
      makeNode("A1"),
      makeNode("A2"),
      makeNode("A3"),
      makeNode("B1"),
      makeNode("B2"),
      makeNode("B3"),
    ];

    const matrix = [
      [1.0, 0.85, 0.85, 0.65, 0.65, 0.65],
      [0.85, 1.0, 0.85, 0.65, 0.65, 0.65],
      [0.85, 0.85, 1.0, 0.65, 0.65, 0.65],
      [0.65, 0.65, 0.65, 1.0, 0.85, 0.85],
      [0.65, 0.65, 0.65, 0.85, 1.0, 0.85],
      [0.65, 0.65, 0.65, 0.85, 0.85, 1.0],
    ];

    applyGraphVectorProjection({
      nodes,
      matrix,
      nodeSpacing: 150,
      cloudSpacing: 400,
      relationEdges: [],
    });

    const distA1A2 = Math.hypot(nodes[0].x - nodes[1].x, nodes[0].y - nodes[1].y);
    const distA1B1 = Math.hypot(nodes[0].x - nodes[3].x, nodes[0].y - nodes[3].y);
    expect(distA1A2).toBeLessThan(distA1B1);
  });

  it("measures separation ratio across clusters in multi-cluster vault", () => {
    const N = 60;
    const numClusters = 3;
    const clusterSize = N / numClusters;
    const nodes = Array.from({ length: N }, (_, i) => makeNode(`N_${i}`));
    const matrix = Array.from({ length: N }, () => Array(N).fill(0));
    for (let i = 0; i < N; i++) {
      const cI = Math.floor(i / clusterSize);
      for (let j = 0; j < N; j++) {
        if (i === j) { matrix[i][j] = 1.0; continue; }
        const cJ = Math.floor(j / clusterSize);
        if (cI === cJ) {
          matrix[i][j] = 0.78; // within cluster
        } else {
          matrix[i][j] = 0.72; // between clusters
        }
      }
    }

    applyGraphVectorProjection({
      nodes,
      matrix,
      nodeSpacing: 350,
      cloudSpacing: 800,
      relationEdges: [],
    });

    let intraDistSum = 0;
    let intraCount = 0;
    let interDistSum = 0;
    let interCount = 0;

    for (let i = 0; i < N; i++) {
      const cI = Math.floor(i / clusterSize);
      for (let j = i + 1; j < N; j++) {
        const cJ = Math.floor(j / clusterSize);
        const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
        if (cI === cJ) {
          intraDistSum += d;
          intraCount++;
        } else {
          interDistSum += d;
          interCount++;
        }
      }
    }

    const avgIntra = intraDistSum / intraCount;
    const avgInter = interDistSum / interCount;
    const ratio = avgInter / avgIntra;
    expect(ratio).toBeGreaterThan(2.5);
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

  it("maintains spacious separation between nodes when nodeSpacing is increased", () => {
    const nodes = [makeNode("N1"), makeNode("N2"), makeNode("N3"), makeNode("N4")];
    const matrix = [
      [1.0, 0.4, 0.4, 0.4],
      [0.4, 1.0, 0.4, 0.4],
      [0.4, 0.4, 1.0, 0.4],
      [0.4, 0.4, 0.4, 1.0],
    ];

    applyGraphVectorProjection({
      nodes,
      matrix,
      nodeSpacing: 1000,
      cloudSpacing: 2000,
      relationEdges: [],
    });

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dist = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
        expect(dist).toBeGreaterThan(450);
      }
    }
  });

  it("handles 100 notes at maximum spacing without exploding coordinates", () => {
    const N = 100;
    const nodes = Array.from({ length: N }, (_, i) => makeNode(`Node_${i}`));
    const matrix = Array.from({ length: N }, () => Array(N).fill(0.25));
    for (let i = 0; i < N; i++) matrix[i][i] = 1.0;

    applyGraphVectorProjection({
      nodes,
      matrix,
      nodeSpacing: 1600,
      cloudSpacing: 3000,
      relationEdges: [],
    });

    for (const node of nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(Number.isNaN(node.x)).toBe(false);
      expect(Number.isNaN(node.y)).toBe(false);
      expect(Math.abs(node.x)).toBeLessThan(25000);
      expect(Math.abs(node.y)).toBeLessThan(25000);
    }
  });
});

