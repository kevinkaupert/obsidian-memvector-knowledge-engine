import type { RelationEdge, ScatterNode } from "../types";
import { assignClouds } from "./cloudAssignment";
import { computeGraphTopologyWeights } from "./graphTopologyWeights";

export type ProjectionMode = "graphvector";

export interface ProjectionParams {
  nodes: ScatterNode[];
  matrix: number[][];
  nodeSpacing: number;
  cloudSpacing: number;
  relationEdges: RelationEdge[];
}

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash << 5) - hash + s.charCodeAt(i);
  return hash;
}

/**
 * Purpose: Simulates physical 2D layout forces balancing cosine similarity, graph edges, and anti-collision clearances.
 */
export function applyGraphVectorProjection({ nodes, matrix, nodeSpacing, cloudSpacing, relationEdges }: ProjectionParams): void {
  const n = nodes.length;
  if (n === 0) return;

  if (nodes.some((n) => n.cloudId === undefined)) {
    assignClouds(nodes, matrix);
  }

  const targetSpacing = nodeSpacing || 350;
  const clusterRadius = cloudSpacing || 800;
  const { conn, repel } = computeGraphTopologyWeights(nodes, relationEdges);

  // 1. Determine number of semantic clusters
  const numClouds = Math.max(2, Math.min(8, Math.floor(Math.sqrt(n))));
  const cloudAngleStep = (Math.PI * 2) / numClouds;

  // 2. Initial placement: spread nodes evenly around cluster centroid via golden spiral
  const clusterCounts = new Map<number, number>();
  nodes.forEach((node, i) => {
    const cId = node.cloudId !== undefined ? node.cloudId : i % numClouds;
    const cAngle = cId * cloudAngleStep;
    const cX = Math.cos(cAngle) * clusterRadius;
    const cY = Math.sin(cAngle) * clusterRadius;

    const k = clusterCounts.get(cId) || 0;
    clusterCounts.set(cId, k + 1);

    // Sunflower / phyllotaxis spiral distribution around centroid to prevent initial clumping
    const phi = k * 2.399963;
    const r = k === 0 ? 0 : targetSpacing * Math.sqrt(k) * 0.75;

    node.anchorX = cX;
    node.anchorY = cY;
    node.x = cX + Math.cos(phi) * r;
    node.y = cY + Math.sin(phi) * r;
  });

  // 3. Iterative Force Simulation
  const collisionDist = Math.max(80, targetSpacing * 0.55);
  const iterations = 50;

  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 0.5 * (1 - iter / iterations);

    for (let i = 0; i < n; i++) {
      const nodeA = nodes[i];
      // Gentle centering towards cluster anchor
      let fx = (nodeA.anchorX! - nodeA.x) * 0.03;
      let fy = (nodeA.anchorY! - nodeA.y) * 0.03;

      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const nodeB = nodes[j];
        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const dist = Math.hypot(dx, dy) || 1;
        const ux = dx / dist;
        const uy = dy / dist;

        // Check if edge is explicitly repulsive (e.g. CONFLICTS_WITH)
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

        // Hard collision clearance: guarantee dots and labels never overlap
        if (dist < collisionDist) {
          const pushMag = Math.min(targetSpacing, (collisionDist - dist) * 0.8);
          fx -= ux * pushMag;
          fy -= uy * pushMag;
        }

        // Blend semantic similarity (0-1) with graph topology weight (0-1.5)
        const sim = matrix[i][j];
        const graphWeight = conn[i][j];
        const combinedWeight = sim * 0.6 + Math.min(1.0, graphWeight) * 0.4;

        if (combinedWeight > 0.08) {
          // Attractive force towards ideal distance
          const idealDist = targetSpacing * (1.35 - Math.min(0.65, combinedWeight * 0.65));
          const delta = dist - idealDist;
          const pullMag = Math.max(-targetSpacing * 0.4, Math.min(targetSpacing * 0.4, delta * combinedWeight * 0.25));
          fx += ux * pullMag;
          fy += uy * pullMag;
        } else if (dist < targetSpacing * 1.5) {
          // Repulsive force to keep unrelated nodes well-separated
          const pushMag = Math.min(targetSpacing * 0.3, (targetSpacing * 1.5 - dist) * 0.15);
          fx -= ux * pushMag;
          fy -= uy * pushMag;
        }
      }

      // Step-size clamping to prevent numerical instability or exponential runaway
      const totalF = Math.hypot(fx, fy);
      const move = totalF * alpha;
      const maxMove = Math.min(targetSpacing * 0.25, 80);
      if (move > maxMove && totalF > 0) {
        nodeA.x += (fx / totalF) * maxMove;
        nodeA.y += (fy / totalF) * maxMove;
      } else {
        nodeA.x += fx * alpha;
        nodeA.y += fy * alpha;
      }
    }
  }
}

export function applyProjection(_mode: ProjectionMode, params: ProjectionParams): void {
  applyGraphVectorProjection(params);
}

