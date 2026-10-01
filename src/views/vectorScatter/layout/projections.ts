import type { RelationTermDef } from "../../../relationVocabulary/types";
import { isPlaced, type RelationEdge, type ScatterNode } from "../types";
import { assignClouds } from "./cloudAssignment";
import { computeGraphTopologyWeights } from "./graphTopologyWeights";
import { ANCHOR_STIFFNESS, BOUNDED_START_ALPHA, BOUNDED_STOP_MOVEMENT } from "./layoutTunables";

export type ProjectionMode = "graphvector";

/**
 * Smallest distance a pair of strongly related nodes may be pulled to, as a fraction of the
 * configured node spacing. Without it a large weight would collapse nodes onto each other.
 */
const MIN_PAIR_CLEARANCE_RATIO = 0.12;
/** Upper bound on how far a weight may shorten a pair's target distance and stiffen its spring. */
const MAX_WEIGHT_FACTOR = 6;

export interface ProjectionParams {
  nodes: ScatterNode[];
  matrix: number[][];
  nodeSpacing: number;
  cloudSpacing: number;
  relationEdges: RelationEdge[];
  /** Opt-in WikiLink attraction edges in topology weights (Issue #100) - defaults to off. */
  includeWikiLinksAsRelations?: boolean;
  /** Loaded relation vocabulary driving per-label attraction/repulsion (ADR-0002) - defaults to the bundled STEM vocabulary. */
  vocabulary?: RelationTermDef[];
  /**
   * Bounded adjustment (ADR-0006): only nodes whose id is in `mobileIds` move; all others stay fixed and only exert
   * forces. Mobile nodes that were placed before are softly pulled back toward that position. Omitted for a free
   * global pass.
   */
  bounded?: { mobileIds: ReadonlySet<string> };
}

/** Outcome of a projection run. */
export interface ProjectionResult {
  /** Simulation iterations actually run. */
  iterations: number;
}

/**
 * Purpose: Enforces deterministic eigenvector orientation (SVD-flip convention) so 2D projection axes never randomly mirror across sessions.
 */
export function enforceCanonicalSign(vec: Float64Array): void {
  let maxAbs = 0;
  let sign = 1;
  for (let d = 0; d < vec.length; d++) {
    const abs = Math.abs(vec[d]);
    if (abs > maxAbs) {
      maxAbs = abs;
      sign = vec[d] < 0 ? -1 : 1;
    }
  }
  if (sign === -1) {
    for (let d = 0; d < vec.length; d++) {
      vec[d] = -vec[d];
    }
  }
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
  enforceCanonicalSign(pc1);
  const pc2 = getComponent(pc1);
  enforceCanonicalSign(pc2);

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
  enforceCanonicalSign(v1);
  const v2 = powerIter(v1, 7);
  enforceCanonicalSign(v2);

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
 * Purpose: Simulates physical 2D organic force-directed layout balancing embeddings, graph topology, and many-body repulsion using caller-provided similarity matrix.
 * Architecture: Organic manifold force-directed model (Issue #41, #75). A free pass moves every node, starting with
 * full annealing energy and a gentle pull toward the origin. A bounded pass (ADR-0006) moves only the mobile nodes:
 * it starts with low energy so a settled layout is not re-heated, replaces the origin pull by a soft anchor to each
 * mobile node's previous position, and stops once the largest step falls below BOUNDED_STOP_MOVEMENT.
 */
export function applyGraphVectorProjection({
  nodes,
  matrix,
  nodeSpacing,
  cloudSpacing,
  relationEdges,
  includeWikiLinksAsRelations,
  vocabulary,
  bounded,
}: ProjectionParams): ProjectionResult {
  const n = nodes.length;
  if (n === 0) return { iterations: 0 };

  if (nodes.some((n) => n.cloudId === undefined)) {
    assignClouds(nodes, matrix);
  }

  const targetSpacing = nodeSpacing || 350;
  const clusterRadius = cloudSpacing || 800;
  const { conn, repel } = computeGraphTopologyWeights(nodes, relationEdges, includeWikiLinksAsRelations, vocabulary);
  const isRepelled = new Uint8Array(n * n);
  if (repel && repel.size > 0) {
    for (const key of repel) {
      const dash = key.indexOf("-");
      if (dash !== -1) {
        const a = Number(key.slice(0, dash));
        const b = Number(key.slice(dash + 1));
        if (!Number.isNaN(a) && !Number.isNaN(b) && a < n && b < n) {
          isRepelled[a * n + b] = 1;
          isRepelled[b * n + a] = 1;
        }
      }
    }
  }

  // Positions before this pass: anchors for mobile nodes in a bounded pass.
  const wasPlaced = nodes.map((node) => isPlaced(node));
  const anchors = nodes.map((node) => ({ x: node.x, y: node.y }));

  // 1. Initial placement: use 2D PCA or spectral matrix projection, or center spiral fallback
  const needsPlacement = wasPlaced.every((placed) => !placed);
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
  } else {
    // Incremental placement for newly-added unplaced notes next to their most similar placed note
    nodes.forEach((node, i) => {
      if (wasPlaced[i]) return;
      let bestSim = -1;
      let bestNeighbor: ScatterNode | null = null;
      for (let j = 0; j < n; j++) {
        if (i === j || !wasPlaced[j]) continue;
        if (matrix[i][j] > bestSim) {
          bestSim = matrix[i][j];
          bestNeighbor = nodes[j];
        }
      }
      const phi = i * 2.399963;
      if (bestNeighbor && bestSim > 0.15) {
        node.x = bestNeighbor.x + Math.cos(phi) * targetSpacing * 0.4;
        node.y = bestNeighbor.y + Math.sin(phi) * targetSpacing * 0.4;
      } else {
        node.x = Math.cos(phi) * targetSpacing * 0.5;
        node.y = Math.sin(phi) * targetSpacing * 0.5;
      }
    });
  }

  const mobile = bounded ? nodes.map((node) => bounded.mobileIds.has(node.id)) : null;

  // 2. Iterative Organic Force Simulation
  const collisionDist = Math.max(60, targetSpacing * 0.45);
  const iterations = 60;
  const startAlpha = bounded ? BOUNDED_START_ALPHA : 0.5;
  let ran = 0;

  for (let iter = 0; iter < iterations; iter++) {
    const alpha = startAlpha * (1 - iter / iterations);
    let largestStep = 0;
    ran++;

    for (let i = 0; i < n; i++) {
      if (mobile && !mobile[i]) continue;
      const nodeA = nodes[i];
      let fx: number;
      let fy: number;
      if (!bounded) {
        // Gentle centering gravity towards (0, 0) keeping the graph centered
        fx = -nodeA.x * 0.003;
        fy = -nodeA.y * 0.003;
      } else if (wasPlaced[i]) {
        // Soft anchor to the position before this pass, limiting how far an existing node drifts
        fx = (anchors[i].x - nodeA.x) * ANCHOR_STIFFNESS;
        fy = (anchors[i].y - nodeA.y) * ANCHOR_STIFFNESS;
      } else {
        fx = 0;
        fy = 0;
      }
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const nodeB = nodes[j];
        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const dist = Math.hypot(dx, dy) || 1;
        const ux = dx / dist;
        const uy = dy / dist;

        // Explicit repulsion for CONFLICTS_WITH edges (O(1) numeric lookup without heap string allocations)
        if (isRepelled[i * n + j] === 1) {
          const minDist = targetSpacing * 2.5;
          if (dist < minDist) {
            const pushMag = Math.min(targetSpacing * 0.6, (minDist - dist) * 0.5);
            fx -= ux * pushMag;
            fy -= uy * pushMag;
          }
          continue;
        }

        const sim = matrix[i][j];
        const graphWeight = conn[i][j];
        // Affinity selects the base target distance and stays in [0, 1]: the mapping below
        // subtracts it from a constant, so a value above 1 would invert the target.
        const topWeight = Math.min(1.0, graphWeight);

        // A declared relation stronger than the generic 1.0 pulls its pair closer than the
        // generic target and holds them there against competing forces. That range was
        // previously clamped away, which made every weight >= 1 behave identically.
        // Weights at or below 1.0 keep weightFactor 1 and are therefore unaffected.
        const weightFactor = Math.min(MAX_WEIGHT_FACTOR, Math.max(1, graphWeight));
        // Strongly related nodes are allowed to sit closer than the generic clearance,
        // down to a hard floor that still keeps them visually distinct.
        const pairClearance = Math.max(targetSpacing * MIN_PAIR_CLEARANCE_RATIO, collisionDist / weightFactor);

        // Anti-overlap collision clearance
        if (dist < pairClearance) {
          const pushMag = Math.min(targetSpacing, (pairClearance - dist) * 0.85);
          fx -= ux * pushMag;
          fy -= uy * pushMag;
        }

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
          const idealDist = Math.max(targetSpacing * MIN_PAIR_CLEARANCE_RATIO, (targetSpacing * (1.15 - affinity * 0.75)) / weightFactor);
          const delta = dist - idealDist;
          if (delta > 0) {
            const pullMag = Math.min(targetSpacing * 0.5, delta * affinity * 0.3 * weightFactor);
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
        if (step > largestStep) largestStep = step;
      }
    }

    if (bounded && largestStep < BOUNDED_STOP_MOVEMENT) break;
  }

  for (const node of nodes) node.placed = true;
  return { iterations: ran };
}

