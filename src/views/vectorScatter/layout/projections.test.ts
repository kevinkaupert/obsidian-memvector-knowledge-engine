import { describe, expect, it } from "vitest";
import type { RelationEdge, ScatterNode } from "../types";
import { applyGraphVectorProjection } from "./projections";
import { rescaleSimilarityMatrix } from "./similarity";

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
      matrix: rescaleSimilarityMatrix(matrix),
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

  it("draws cross-cluster bridge notes between topics instead of stranding them across void", () => {
    // 2 clusters of 8 notes each, plus a bridge note connected to both clusters
    const N = 17;
    const nodes = Array.from({ length: N }, (_, i) => makeNode(`Node_${i}`));
    const matrix = Array.from({ length: N }, () => Array(N).fill(0));

    for (let i = 0; i < 16; i++) {
      const cI = i < 8 ? 0 : 1;
      for (let j = 0; j < 16; j++) {
        if (i === j) { matrix[i][j] = 1.0; continue; }
        const cJ = j < 8 ? 0 : 1;
        matrix[i][j] = cI === cJ ? 0.9 : 0.1;
      }
    }
    // Node 16 bridges cluster 0 and cluster 1
    matrix[16][16] = 1.0;
    matrix[16][0] = 0.8;
    matrix[0][16] = 0.8;
    matrix[16][8] = 0.8;
    matrix[8][16] = 0.8;

    applyGraphVectorProjection({
      nodes,
      matrix,
      nodeSpacing: 350,
      cloudSpacing: 800,
      relationEdges: [],
    });

    const c0Centroid = {
      x: nodes.slice(0, 8).reduce((acc, n) => acc + n.x, 0) / 8,
      y: nodes.slice(0, 8).reduce((acc, n) => acc + n.y, 0) / 8,
    };
    const c1Centroid = {
      x: nodes.slice(8, 16).reduce((acc, n) => acc + n.x, 0) / 8,
      y: nodes.slice(8, 16).reduce((acc, n) => acc + n.y, 0) / 8,
    };
    const bridge = nodes[16];

    const distC0toC1 = Math.hypot(c0Centroid.x - c1Centroid.x, c0Centroid.y - c1Centroid.y);
    const distBridgeToC0 = Math.hypot(bridge.x - c0Centroid.x, bridge.y - c0Centroid.y);
    const distBridgeToC1 = Math.hypot(bridge.x - c1Centroid.x, bridge.y - c1Centroid.y);

    // Bridge node sits comfortably between both cluster centroids rather than outside
    expect(distBridgeToC0).toBeLessThan(distC0toC1);
    expect(distBridgeToC1).toBeLessThan(distC0toC1);
  });

  it("pushes multiple pairs apart using precomputed numeric repulsion table without error (#80)", () => {
    const N = 8;
    const nodes = Array.from({ length: N }, (_, i) => makeNode(`Node_${i}`));
    const matrix = Array.from({ length: N }, () => Array(N).fill(0.7));
    for (let i = 0; i < N; i++) matrix[i][i] = 1.0;

    const relationEdges: RelationEdge[] = [
      {
        srcId: "Node_0",
        tgtId: "Node_1",
        relType: "CONFLICTS_WITH",
        desc: "Contradiction 0-1",
        title: "Contradiction 0-1",
        path: "wiki/relations/0-1.md",
        bidirectional: true,
      },
      {
        srcId: "Node_2",
        tgtId: "Node_3",
        relType: "CONFLICTS_WITH",
        desc: "Contradiction 2-3",
        title: "Contradiction 2-3",
        path: "wiki/relations/2-3.md",
        bidirectional: true,
      },
    ];

    applyGraphVectorProjection({
      nodes,
      matrix,
      nodeSpacing: 200,
      cloudSpacing: 500,
      relationEdges,
    });

    for (const node of nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }

    const dist01 = Math.hypot(nodes[0].x - nodes[1].x, nodes[0].y - nodes[1].y);
    const dist23 = Math.hypot(nodes[2].x - nodes[3].x, nodes[2].y - nodes[3].y);
    expect(dist01).toBeGreaterThan(150);
    expect(dist23).toBeGreaterThan(150);
  });
});

describe("relation weight strength", () => {
  /**
   * Distances measured against the implementation as it stood before weights above 1.0
   * became effective (commit bec83db). Pinning them here is what makes the regression
   * guard meaningful: recomputing an expectation from the current code would pass no
   * matter how the mapping drifts.
   */
  const PRE_CHANGE_DISTANCE: Record<string, number> = {
    "0.05": 764.2069615667052,
    "0.25": 374.42325740542947,
    "0.5": 273.1877836248406,
    "0.75": 204.7033513968628,
    "1": 152.73454120388942,
  };

  /** Two directly related nodes, identical start positions, only the weight differs. */
  function distanceForWeight(weight: number, nodeSpacing = 350): number {
    const a = makeNode("A");
    const b = makeNode("B");
    a.x = -400;
    a.y = 0;
    b.x = 400;
    b.y = 0;
    applyGraphVectorProjection({
      nodes: [a, b],
      matrix: [
        [1, 0],
        [0, 1],
      ],
      nodeSpacing,
      cloudSpacing: 800,
      relationEdges: [{ srcId: "A", tgtId: "B", relType: "REL" } as RelationEdge],
      vocabulary: [{ key: "rel", label: "REL", term: "rel", category: "Custom", bidirectional: true, reversed: false, weight }],
    });
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  it("leaves every weight at or below the generic 1.0 exactly where it was", () => {
    for (const [weight, expected] of Object.entries(PRE_CHANGE_DISTANCE)) {
      expect(distanceForWeight(Number(weight))).toBeCloseTo(expected, 9);
    }
  });

  it("places a stronger-than-generic relation closer than a generic one", () => {
    expect(distanceForWeight(1.1)).toBeLessThan(distanceForWeight(1.0));
    expect(distanceForWeight(1.3)).toBeLessThan(distanceForWeight(1.1));
  });

  it("keeps shortening the distance monotonically across the whole range", () => {
    const weights = [0.05, 0.25, 0.5, 0.75, 1.0, 1.1, 1.3, 2.0, 2.5, 4.0];
    const distances = weights.map((w) => distanceForWeight(w));
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeLessThan(distances[i - 1]);
    }
  });

  it("saturates rather than collapsing further once the weight factor is capped", () => {
    // Beyond the cap the mapping stops changing, so an absurd weight is no more
    // extreme than the largest supported one.
    const capped = distanceForWeight(6);
    expect(distanceForWeight(50)).toBeCloseTo(capped, 9);
    expect(distanceForWeight(5000)).toBeCloseTo(capped, 9);
    expect(capped).toBeGreaterThan(0);
  });

  it("scales the saturated floor with the configured node spacing", () => {
    // The floor is a fraction of node spacing, not an absolute pixel count.
    expect(distanceForWeight(50, 700)).toBeGreaterThan(distanceForWeight(50, 350));
  });

  it("still separates a strongly bound pair inside a graph with competing forces", () => {
    // A-B are strongly bound; C is pulled at generic strength and D actively repels A,
    // so the pair has to hold its distance against forces other than its own spring.
    const a = makeNode("A");
    const b = makeNode("B");
    const c = makeNode("C");
    const d = makeNode("D");
    const nodes = [a, b, c, d];
    nodes.forEach((node, i) => {
      node.x = Math.cos((i / nodes.length) * Math.PI * 2) * 400;
      node.y = Math.sin((i / nodes.length) * Math.PI * 2) * 400;
    });

    applyGraphVectorProjection({
      nodes,
      matrix: [
        [1, 0.1, 0.4, 0.1],
        [0.1, 1, 0.1, 0.1],
        [0.4, 0.1, 1, 0.1],
        [0.1, 0.1, 0.1, 1],
      ],
      nodeSpacing: 350,
      cloudSpacing: 800,
      relationEdges: [
        { srcId: "A", tgtId: "B", relType: "STRONG" } as RelationEdge,
        { srcId: "A", tgtId: "C", relType: "REL" } as RelationEdge,
        { srcId: "A", tgtId: "D", relType: "AGAINST" } as RelationEdge,
      ],
      vocabulary: [
        { key: "s", label: "STRONG", term: "s", category: "Custom", bidirectional: true, reversed: false, weight: 3 },
        { key: "r", label: "REL", term: "r", category: "Custom", bidirectional: true, reversed: false },
        { key: "a", label: "AGAINST", term: "a", category: "Custom", bidirectional: true, reversed: false, repels: true },
      ],
    });

    const distAB = Math.hypot(a.x - b.x, a.y - b.y);
    const distAC = Math.hypot(a.x - c.x, a.y - c.y);
    const distAD = Math.hypot(a.x - d.x, a.y - d.y);

    // The strongly weighted pair ends up closest, the repelled one furthest.
    expect(distAB).toBeLessThan(distAC);
    expect(distAC).toBeLessThan(distAD);
    // No pair of nodes coincides. This is an observed property of the finished layout,
    // not a guarantee the target-distance floor by itself provides.
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        expect(Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y)).toBeGreaterThan(1);
      }
    }
  });
});
