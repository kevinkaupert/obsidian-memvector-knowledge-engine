import type { RelationEdge, ScatterNode } from "../types";
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
 * GraphVektor Unified Projection: A physical force-directed relaxation layout
 * that smoothly balances dense vector embeddings (semantic similarity),
 * WikiLinks, and typed multi-hop graph relationship edges.
 */
export function applyGraphVectorProjection({ nodes, matrix, nodeSpacing, cloudSpacing, relationEdges }: ProjectionParams): void {
  const n = nodes.length;
  if (n === 0) return;

  const targetSpacing = nodeSpacing || 180;
  const initialRadius = (cloudSpacing || 400) * 0.7;
  const { conn, repel } = computeGraphTopologyWeights(nodes, relationEdges);

  // 1. Initial layout: golden-ratio spiral distribution with deterministic jitter
  const phi = (1 + Math.sqrt(5)) / 2;
  nodes.forEach((node, i) => {
    const angle = i * 2 * Math.PI * (1 - 1 / phi);
    const r = Math.sqrt((i + 1) / n) * initialRadius;
    const hash = hashString(node.id);
    const jitterX = (Math.abs(hash) % 40) - 20;
    const jitterY = (Math.abs(hash >> 3) % 40) - 20;
    node.x = Math.cos(angle) * r + jitterX;
    node.y = Math.sin(angle) * r + jitterY;
  });

  // 2. Iterative Force Simulation
  const iterations = 50;
  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 0.6 * (1 - iter / iterations);

    for (let i = 0; i < n; i++) {
      const nodeA = nodes[i];
      let fx = 0;
      let fy = 0;

      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const nodeB = nodes[j];
        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const dist = Math.hypot(dx, dy) || 1;

        // Check if edge is explicitly repulsive (e.g. CONFLICTS_WITH)
        const pairKey = `${Math.min(i, j)}-${Math.max(i, j)}`;
        if (repel.has(pairKey)) {
          const minDist = targetSpacing * 2.0;
          if (dist < minDist) {
            const push = ((minDist - dist) / dist) * 0.4;
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
          const idealDist = targetSpacing * Math.max(0.25, 1 - combinedWeight * 0.75);
          const delta = dist - idealDist;
          const pull = (delta / dist) * combinedWeight * 0.3;
          fx += dx * pull;
          fy += dy * pull;
        } else if (dist < targetSpacing * 0.6) {
          // Repulsive force to prevent overlap of unrelated nodes
          const push = ((targetSpacing * 0.6 - dist) / dist) * 0.25;
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

