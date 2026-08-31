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

export function applyGraphVectorProjection({ nodes, matrix, nodeSpacing, cloudSpacing, relationEdges }: ProjectionParams): void {
  const n = nodes.length;
  if (n === 0) return;

  if (nodes.some((n) => n.cloudId === undefined)) {
    assignClouds(nodes, matrix);
  }

  const targetSpacing = nodeSpacing || 200;
  const clusterRadius = cloudSpacing || 600;
  const { conn, repel } = computeGraphTopologyWeights(nodes, relationEdges);

  // 1. Determine number of semantic clusters
  const numClouds = Math.max(2, Math.min(8, Math.floor(Math.sqrt(n))));
  const cloudAngleStep = (Math.PI * 2) / numClouds;

  // 2. Initial placement: anchor each node around its cluster centroid
  nodes.forEach((node, i) => {
    const cId = node.cloudId !== undefined ? node.cloudId : i % numClouds;
    const cAngle = cId * cloudAngleStep;
    const cX = Math.cos(cAngle) * clusterRadius;
    const cY = Math.sin(cAngle) * clusterRadius;

    const hash = hashString(node.id);
    const offsetX = ((Math.abs(hash) % (targetSpacing * 1.5)) - targetSpacing * 0.75);
    const offsetY = ((Math.abs(hash >> 3) % (targetSpacing * 1.5)) - targetSpacing * 0.75);

    node.anchorX = cX + offsetX;
    node.anchorY = cY + offsetY;
    node.x = node.anchorX;
    node.y = node.anchorY;
  });

  // 3. Iterative Force Simulation
  const iterations = 45;
  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 0.5 * (1 - iter / iterations);

    for (let i = 0; i < n; i++) {
      const nodeA = nodes[i];
      // Soft spring pulling towards cluster anchor
      let fx = (nodeA.anchorX! - nodeA.x) * 0.1;
      let fy = (nodeA.anchorY! - nodeA.y) * 0.1;

      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const nodeB = nodes[j];
        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const dist = Math.hypot(dx, dy) || 1;

        // Check if edge is explicitly repulsive (e.g. CONFLICTS_WITH)
        const pairKey = `${Math.min(i, j)}-${Math.max(i, j)}`;
        if (repel.has(pairKey)) {
          const minDist = targetSpacing * 2.2;
          if (dist < minDist) {
            const push = ((minDist - dist) / dist) * 0.5;
            fx -= dx * push;
            fy -= dy * push;
          }
          continue;
        }

        // Blend semantic similarity (0-1) with graph topology weight (0-1.5)
        const sim = matrix[i][j];
        const graphWeight = conn[i][j];
        const combinedWeight = sim * 0.6 + Math.min(1.0, graphWeight) * 0.4;

        if (combinedWeight > 0.08) {
          // Attractive force towards ideal distance
          const idealDist = targetSpacing * (1 - Math.min(0.85, combinedWeight * 0.7));
          const delta = dist - idealDist;
          const pull = (delta / dist) * combinedWeight * 0.25;
          fx += dx * pull;
          fy += dy * pull;
        } else if (dist < targetSpacing * 0.65) {
          // Repulsive force to prevent overlap of unrelated nodes
          const push = ((targetSpacing * 0.65 - dist) / dist) * 0.25;
          fx -= dx * push;
          fy -= dy * push;
        }
      }

      nodeA.x += fx * alpha;
      nodeA.y += fy * alpha;
    }
  }
}

export function applyProjection(_mode: ProjectionMode, params: ProjectionParams): void {
  applyGraphVectorProjection(params);
}

