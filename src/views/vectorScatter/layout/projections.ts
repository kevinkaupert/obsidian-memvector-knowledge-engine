import type { RelationEdge, ScatterNode } from "../types";
import { assignClouds } from "./cloudAssignment";
import { computeGraphTopologyWeights } from "./graphTopologyWeights";
import { rescaleSimilarityMatrix } from "./similarity";

export type ProjectionMode = "graphvector";

export interface ProjectionParams {
  nodes: ScatterNode[];
  matrix: number[][];
  nodeSpacing: number;
  cloudSpacing: number;
  relationEdges: RelationEdge[];
}

/**
 * Purpose: Fast 2D PCA projection of high-dimensional embeddings via power iteration for organic initial placement.
 */
export function compute2DPcaProjection(nodes: ScatterNode[], cloudSpacing: number): boolean {
  const embedded = nodes.filter((n) => n.embedding && n.embedding.length > 0);
  if (embedded.length < 3) return false;
  const dim = embedded[0].embedding!.length;
  const n = embedded.length;

  const mean = new Float64Array(dim);
  for (let i = 0; i < n; i++) {
    const vec = embedded[i].embedding!;
    for (let d = 0; d < dim; d++) mean[d] += vec[d];
  }
  for (let d = 0; d < dim; d++) mean[d] /= n;

  const centered = embedded.map((node) => {
    const vec = node.embedding!;
    const row = new Float64Array(dim);
    for (let d = 0; d < dim; d++) row[d] = vec[d] - mean[d];
    return row;
  });

  function getComponent(deflateVec: Float64Array | null): Float64Array {
    const p = new Float64Array(dim);
    for (let d = 0; d < dim; d++) p[d] = Math.sin((d + 1) * 1.61803398875);
    for (let iter = 0; iter < 15; iter++) {
      if (deflateVec) {
        let dot = 0;
        for (let d = 0; d < dim; d++) dot += p[d] * deflateVec[d];
        for (let d = 0; d < dim; d++) p[d] -= dot * deflateVec[d];
      }
      const xp = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let d = 0; d < dim; d++) sum += centered[i][d] * p[d];
        xp[i] = sum;
      }
      const nextP = new Float64Array(dim);
      for (let i = 0; i < n; i++) {
        const val = xp[i];
        for (let d = 0; d < dim; d++) nextP[d] += centered[i][d] * val;
      }
      let norm = 0;
      for (let d = 0; d < dim; d++) norm += nextP[d] * nextP[d];
      norm = Math.sqrt(norm) || 1;
      for (let d = 0; d < dim; d++) p[d] = nextP[d] / norm;
    }
    return p;
  }

  const pc1 = getComponent(null);
  const pc2 = getComponent(pc1);

  const rawCoords = centered.map((row) => {
    let x = 0;
    let y = 0;
    for (let d = 0; d < dim; d++) {
      x += row[d] * pc1[d];
      y += row[d] * pc2[d];
    }
    return { x, y };
  });

  let sumSq = 0;
  rawCoords.forEach((c) => {
    sumSq += c.x * c.x + c.y * c.y;
  });
  const std = Math.sqrt(sumSq / (2 * n)) || 1;
  const targetRadius = (cloudSpacing || 800) * 0.75;
  const scale = targetRadius / std;

  embedded.forEach((node, i) => {
    node.x = rawCoords[i].x * scale;
    node.y = rawCoords[i].y * scale;
  });

  return true;
}

/**
 * Purpose: Computes 2D coordinates via fast spectral / power iteration on the similarity matrix for graph/test nodes lacking raw embeddings.
 */
export function compute2DProjectionFromMatrix(nodes: ScatterNode[], matrix: number[][], cloudSpacing: number): boolean {
  const n = nodes.length;
  if (n < 3 || matrix.length !== n) return false;

  const colMeans = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) colMeans[j] += matrix[i][j];
  }
  for (let j = 0; j < n; j++) colMeans[j] /= n;

  const centered = matrix.map((row) => {
    const r = new Float64Array(n);
    for (let j = 0; j < n; j++) r[j] = row[j] - colMeans[j];
    return r;
  });

  function powerIter(deflate: Float64Array | null, seedOffset: number): Float64Array {
    const p = new Float64Array(n);
    for (let i = 0; i < n; i++) p[i] = Math.cos((i + seedOffset) * 2.39996);
    if (deflate) {
      let d = 0;
      for (let i = 0; i < n; i++) d += p[i] * deflate[i];
      for (let i = 0; i < n; i++) p[i] -= d * deflate[i];
    }
    for (let iter = 0; iter < 30; iter++) {
      const xp = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let j = 0; j < n; j++) s += centered[i][j] * p[j];
        xp[i] = s;
      }
      const nextP = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const val = xp[i];
        for (let j = 0; j < n; j++) nextP[j] += centered[i][j] * val;
      }
      if (deflate) {
        let d = 0;
        for (let i = 0; i < n; i++) d += nextP[i] * deflate[i];
        for (let i = 0; i < n; i++) nextP[i] -= d * deflate[i];
      }
      let norm = 0;
      for (let i = 0; i < n; i++) norm += nextP[i] * nextP[i];
      norm = Math.sqrt(norm);
      if (norm < 1e-8) break;
      for (let i = 0; i < n; i++) p[i] = nextP[i] / norm;
    }
    return p;
  }

  const v1 = powerIter(null, 1);
  const v2 = powerIter(v1, 7);

  const coords = centered.map((row) => {
    let x = 0;
    let y = 0;
    for (let j = 0; j < n; j++) {
      x += row[j] * v1[j];
      y += row[j] * v2[j];
    }
    return { x, y };
  });

  let sumSq = 0;
  coords.forEach((c) => {
    sumSq += c.x * c.x + c.y * c.y;
  });
  const std = Math.sqrt(sumSq / (2 * n)) || 1;
  if (std < 1e-4) return false;

  const targetR = (cloudSpacing || 800) * 0.75;
  const s = targetR / std;
  nodes.forEach((node, i) => {
    const phi = i * 2.399963;
    const r = (cloudSpacing || 800) * 0.05 * Math.sqrt((i % 25) + 1);
    node.x = coords[i].x * s + Math.cos(phi) * r;
    node.y = coords[i].y * s + Math.sin(phi) * r;
  });

  return true;
}

/**
 * Purpose: Simulates physical 2D organic force-directed layout balancing embeddings, graph topology, and many-body repulsion.
 * Architecture: Organic manifold force-directed model (Issue #41).
 */
export function applyGraphVectorProjection({ nodes, matrix: rawMatrix, nodeSpacing, cloudSpacing, relationEdges }: ProjectionParams): void {
  const n = nodes.length;
  if (n === 0) return;

  const matrix = rescaleSimilarityMatrix(rawMatrix);

  if (nodes.some((n) => n.cloudId === undefined)) {
    assignClouds(nodes, matrix);
  }

  const targetSpacing = nodeSpacing || 350;
  const clusterRadius = cloudSpacing || 800;
  const { conn, repel } = computeGraphTopologyWeights(nodes, relationEdges);

  // 1. Initial placement: use 2D PCA or spectral matrix projection, or center spiral fallback
  const needsPlacement = nodes.every((node) => node.x === 0 && node.y === 0);
  if (needsPlacement) {
    const hasPca = compute2DPcaProjection(nodes, clusterRadius);
    const hasMatrixProj = !hasPca && compute2DProjectionFromMatrix(nodes, matrix, clusterRadius);
    if (!hasPca && !hasMatrixProj) {
      nodes.forEach((node, i) => {
        const phi = i * 2.399963;
        const r = i === 0 ? 0 : targetSpacing * Math.sqrt(i) * 0.5;
        node.x = Math.cos(phi) * r;
        node.y = Math.sin(phi) * r;
      });
    } else if (hasPca) {
      nodes.forEach((node, i) => {
        if (!node.embedding || node.embedding.length === 0) {
          const phi = i * 2.399963;
          node.x = Math.cos(phi) * targetSpacing * 0.5;
          node.y = Math.sin(phi) * targetSpacing * 0.5;
        }
      });
    }
  }

  // 2. Iterative Organic Force Simulation
  const collisionDist = Math.max(60, targetSpacing * 0.45);
  const iterations = 60;

  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 0.5 * (1 - iter / iterations);

    for (let i = 0; i < n; i++) {
      const nodeA = nodes[i];
      // Gentle centering gravity towards (0, 0) keeping the graph centered
      let fx = -nodeA.x * 0.003;
      let fy = -nodeA.y * 0.003;

      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const nodeB = nodes[j];
        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const dist = Math.hypot(dx, dy) || 1;
        const ux = dx / dist;
        const uy = dy / dist;

        // Explicit repulsion for CONFLICTS_WITH edges
        const pairKey = `${Math.min(i, j)}-${Math.max(i, j)}`;
        if (repel.has(pairKey)) {
          const minDist = targetSpacing * 2.5;
          if (dist < minDist) {
            const pushMag = Math.min(targetSpacing * 0.6, (minDist - dist) * 0.5);
            fx -= ux * pushMag;
            fy -= uy * pushMag;
          }
          continue;
        }

        // Anti-overlap collision clearance
        if (dist < collisionDist) {
          const pushMag = Math.min(targetSpacing, (collisionDist - dist) * 0.85);
          fx -= ux * pushMag;
          fy -= uy * pushMag;
        }

        const sim = matrix[i][j];
        const graphWeight = conn[i][j];
        const topWeight = Math.min(1.0, graphWeight);

        // Non-linear semantic strength to filter out background noise
        const semStrength = Math.pow(sim, 2);
        const affinity = Math.max(topWeight, semStrength);

        const repelRadius = Math.max(targetSpacing * 1.5, clusterRadius * 0.7);
        if (affinity < 0.15 && dist < repelRadius) {
          // Repulsive force to keep unrelated topics separated
          const pushMag = Math.min(targetSpacing * 0.4, (repelRadius - dist) * 0.15);
          fx -= ux * pushMag;
          fy -= uy * pushMag;
        } else if (affinity >= 0.15) {
          // Attractive spring force towards ideal distance
          const idealDist = targetSpacing * (1.15 - affinity * 0.75);
          const delta = dist - idealDist;
          if (delta > 0) {
            const pullMag = Math.min(targetSpacing * 0.5, delta * affinity * 0.3);
            fx += ux * pullMag;
            fy += uy * pullMag;
          } else {
            const pushMag = Math.min(targetSpacing * 0.3, -delta * affinity * 0.2);
            fx -= ux * pushMag;
            fy -= uy * pushMag;
          }
        }
      }

      // Step-size clamping with annealing to ensure convergence
      const totalF = Math.hypot(fx, fy);
      if (totalF > 0) {
        const maxStep = Math.min(targetSpacing * 0.3, 80) * alpha;
        const step = Math.min(totalF * alpha, maxStep);
        nodeA.x += (fx / totalF) * step;
        nodeA.y += (fy / totalF) * step;
      }
    }
  }
}

export function applyProjection(_mode: ProjectionMode, params: ProjectionParams): void {
  applyGraphVectorProjection(params);
}

