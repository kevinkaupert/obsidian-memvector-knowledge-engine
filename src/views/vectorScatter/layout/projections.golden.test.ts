/**
 * Purpose: Golden characterization of applyGraphVectorProjection (#76): exact coordinates, iterations, placed flags and
 * cloud fields for every placement and simulation path, recorded before the function was split. A split must
 * reproduce them bit for bit (same arithmetic, same in-place update order).
 */
import { describe, expect, it } from "vitest";
import type { RelationEdge, ScatterNode } from "../types";
import { applyGraphVectorProjection, type ProjectionParams } from "./projections";

/** Deterministic pseudo-random numbers (LCG), so fixtures are stable across runs and platforms. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function node(id: string, extra: Partial<ScatterNode> = {}): ScatterNode {
  return { id, basenameKey: id, title: id, path: `${id}.md`, x: 0, y: 0, type: "concept", latexFormulas: [], links: [], content: id, ...extra };
}

/** Embeddings in two topics plus noise; the matrix is their cosine similarity. */
function topicNodes(count: number, seed: number, dims = 6): ScatterNode[] {
  const r = rng(seed);
  return Array.from({ length: count }, (_, i) => {
    const topic = i % 2;
    const embedding = Array.from({ length: dims }, (_, d) => (d % 2 === topic ? 1 : 0.1) + (r() - 0.5) * 0.4);
    return node(`n${i}`, { embedding });
  });
}

function cosineMatrix(nodes: ScatterNode[]): number[][] {
  return nodes.map((a) =>
    nodes.map((b) => {
      const ea = a.embedding ?? [];
      const eb = b.embedding ?? [];
      if (ea.length === 0 || eb.length === 0) return a === b ? 1 : 0;
      let dot = 0;
      let na = 0;
      let nb = 0;
      for (let k = 0; k < ea.length; k++) {
        dot += ea[k] * eb[k];
        na += ea[k] * ea[k];
        nb += eb[k] * eb[k];
      }
      return dot / Math.sqrt(na * nb);
    })
  );
}

function edge(srcId: string, tgtId: string, relType: string): RelationEdge {
  return { srcId, tgtId, relType, desc: "", title: "", path: `rel-${srcId}-${tgtId}.md`, bidirectional: false };
}

/** Runs a projection and returns everything a split could change, plus identity checks. */
function run(nodes: ScatterNode[], params: Omit<ProjectionParams, "nodes">) {
  const objects = [...nodes];
  const result = applyGraphVectorProjection({ nodes, ...params });
  expect(nodes.every((n, i) => n === objects[i])).toBe(true);
  return {
    iterations: result.iterations,
    nodes: nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, placed: n.placed, cloudId: n.cloudId, cloudLabel: n.cloudLabel })),
  };
}

const BASE = { nodeSpacing: 350, cloudSpacing: 800, relationEdges: [] as RelationEdge[] };

describe("applyGraphVectorProjection golden outputs (#76)", () => {
  it("free pass from scratch with embeddings (PCA placement)", () => {
    const nodes = topicNodes(8, 1);
    expect(run(nodes, { ...BASE, matrix: cosineMatrix(nodes) })).toMatchSnapshot();
  });

  it("free pass without embeddings uses the matrix projection", () => {
    const withVectors = topicNodes(6, 2);
    const matrix = cosineMatrix(withVectors);
    const nodes = withVectors.map((n) => node(n.id));
    expect(run(nodes, { ...BASE, matrix })).toMatchSnapshot();
  });

  it("free pass without embeddings and a flat matrix falls back to the spiral", () => {
    const nodes = Array.from({ length: 5 }, (_, i) => node(`s${i}`));
    const matrix = nodes.map((_, i) => nodes.map((__, j) => (i === j ? 1 : 0.5)));
    expect(run(nodes, { ...BASE, matrix })).toMatchSnapshot();
  });

  it("PCA with nodes lacking embeddings, on both sides of the 0.15 neighbor threshold", () => {
    const nodes = [...topicNodes(6, 3), node("near"), node("far")];
    const matrix = cosineMatrix(nodes);
    matrix[6][0] = matrix[0][6] = 0.4; // above 0.15: next to n0
    matrix[7][1] = matrix[1][7] = 0.1; // below 0.15 everywhere: on the outer ring
    expect(run(nodes, { ...BASE, matrix })).toMatchSnapshot();
  });

  it("warm free pass over placed nodes", () => {
    const nodes = topicNodes(6, 4);
    const matrix = cosineMatrix(nodes);
    applyGraphVectorProjection({ nodes, matrix, ...BASE });
    expect(run(nodes, { ...BASE, matrix })).toMatchSnapshot();
  });

  it("incremental placement of several new nodes, including a tie between neighbors", () => {
    const nodes = topicNodes(7, 5);
    const matrix = cosineMatrix(nodes);
    applyGraphVectorProjection({ nodes: nodes.slice(0, 5), matrix: matrix.slice(0, 5).map((r) => r.slice(0, 5)), ...BASE });
    matrix[5][0] = matrix[0][5] = 0.7;
    matrix[5][1] = matrix[1][5] = 0.7; // tie: the first neighbor wins
    nodes[6].embedding = undefined;
    expect(run(nodes, { ...BASE, matrix })).toMatchSnapshot();
  });

  it("bounded pass with an existing mobile node, a new mobile node and fixed nodes", () => {
    const nodes = topicNodes(7, 6);
    const matrix = cosineMatrix(nodes);
    applyGraphVectorProjection({ nodes: nodes.slice(0, 6), matrix: matrix.slice(0, 6).map((r) => r.slice(0, 6)), ...BASE });
    const result = run(nodes, { ...BASE, matrix, bounded: { mobileIds: new Set(["n2", "n6"]) } });
    expect(result.iterations).toBeLessThan(60); // stops early once settled
    expect(result).toMatchSnapshot();
  });

  it("CONFLICTS_WITH repels and a relation weight above 1 pulls closer", () => {
    const nodes = topicNodes(6, 7);
    const edges = [edge("n0", "n2", "CONFLICTS_WITH"), edge("n1", "n3", "EQUIVALENT_TO")];
    expect(run(nodes, { ...BASE, matrix: cosineMatrix(nodes), relationEdges: edges })).toMatchSnapshot();
  });
});
