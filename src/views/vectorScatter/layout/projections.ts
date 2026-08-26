import type { RelationEdge, ScatterNode } from "../types";
import { computeGraphTopologyWeights } from "./graphTopologyWeights";

export type ProjectionMode = "cloud" | "umap" | "node2vec" | "formula" | "semantic" | "flow" | "graph";

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

/** MODE 1: Topic Clouds - centroid-anchored force layout using the full hybrid similarity matrix. */
function applyCloudProjection({ nodes, matrix, nodeSpacing, cloudSpacing }: ProjectionParams): void {
  const n = nodes.length;
  const numClouds = Math.max(2, Math.min(8, Math.floor(Math.sqrt(n))));
  const cloudAngleStep = (Math.PI * 2) / numClouds;

  nodes.forEach((node) => {
    const cAngle = (node.cloudId ?? 0) * cloudAngleStep;
    const cX = Math.cos(cAngle) * cloudSpacing;
    const cY = Math.sin(cAngle) * cloudSpacing;
    const hash = hashString(node.id + (node.content || ""));
    node.anchorX = cX + ((Math.abs(hash) % (nodeSpacing * 0.9)) - nodeSpacing * 0.45);
    node.anchorY = cY + ((Math.abs(hash >> 3) % (nodeSpacing * 0.9)) - nodeSpacing * 0.45);
    node.x = node.anchorX;
    node.y = node.anchorY;
  });

  const iterations = 35;
  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 0.5 * (1 - iter / iterations);
    for (let i = 0; i < n; i++) {
      const nodeA = nodes[i];
      let fx = (nodeA.anchorX! - nodeA.x) * 0.12;
      let fy = (nodeA.anchorY! - nodeA.y) * 0.12;

      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const nodeB = nodes[j];
        const dx = nodeA.x - nodeB.x;
        const dy = nodeA.y - nodeB.y;
        const dist = Math.hypot(dx, dy) || 1;
        const sim = matrix[i][j];
        if (sim > 0.08) {
          const idealDist = nodeSpacing * (1 - sim * 0.75);
          const delta = dist - idealDist;
          fx -= (dx / dist) * delta * sim * 0.22;
          fy -= (dy / dist) * delta * sim * 0.22;
        } else if (dist < nodeSpacing * 0.5) {
          fx += (dx / dist) * 16;
          fy += (dy / dist) * 16;
        }
      }
      nodeA.x += fx * alpha;
      nodeA.y += fy * alpha;
    }
  }
}

/** MODE 4: UMAP Manifold - k-nearest-neighbor attraction + non-neighbor repulsion. */
function applyUmapProjection({ nodes, matrix, nodeSpacing, cloudSpacing }: ProjectionParams): void {
  const n = nodes.length;
  const k = Math.min(12, Math.max(2, n - 1));
  const targetSpacing = nodeSpacing || 180;

  const knn: { index: number; sim: number }[][] = [];
  for (let i = 0; i < n; i++) {
    const neighbors: { index: number; sim: number }[] = [];
    for (let j = 0; j < n; j++) {
      if (i !== j) neighbors.push({ index: j, sim: matrix[i][j] });
    }
    neighbors.sort((a, b) => b.sim - a.sim);
    knn[i] = neighbors.slice(0, k);
  }

  nodes.forEach((node, i) => {
    const angle = (i / n) * Math.PI * 2;
    const radius = (cloudSpacing || 450) * (0.4 + (i % 3) * 0.3);
    node.x = Math.cos(angle) * radius;
    node.y = Math.sin(angle) * radius;
  });

  const iterations = 60;
  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 0.6 * (1 - iter / iterations);
    for (let i = 0; i < n; i++) {
      const nodeA = nodes[i];
      let fx = 0;
      let fy = 0;

      knn[i].forEach((nb) => {
        const nodeB = nodes[nb.index];
        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const dist = Math.hypot(dx, dy) || 1;
        const idealDist = targetSpacing * (1 - nb.sim * 0.8);
        const delta = dist - idealDist;
        fx += (dx / dist) * delta * nb.sim * 0.3;
        fy += (dy / dist) * delta * nb.sim * 0.3;
      });

      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const nodeB = nodes[j];
        const dx = nodeA.x - nodeB.x;
        const dy = nodeA.y - nodeB.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < targetSpacing * 0.65) {
          fx += (dx / dist) * (targetSpacing * 0.65 - dist) * 0.25;
          fy += (dy / dist) * (targetSpacing * 0.65 - dist) * 0.25;
        }
      }
      nodeA.x += fx * alpha;
      nodeA.y += fy * alpha;
    }
  }
}

/**
 * MODE 5: Graph-Topology - node2vec-*flavored* (not actual node2vec, no
 * random walks/skip-gram) force layout driven purely by graph connectivity,
 * not vector similarity. See graphTopologyWeights.ts for the real hop-distance
 * + relation-type weighting this now uses instead of a flat linked/not-linked split.
 */
function applyNode2VecProjection({ nodes, nodeSpacing, cloudSpacing, relationEdges }: ProjectionParams): void {
  const n = nodes.length;
  const targetSpacing = nodeSpacing || 180;
  const cloudRadius = cloudSpacing || 500;
  const { conn, repel } = computeGraphTopologyWeights(nodes, relationEdges);

  nodes.forEach((node, i) => {
    const angle = (i / n) * Math.PI * 2;
    node.x = Math.cos(angle) * cloudRadius * 0.7;
    node.y = Math.sin(angle) * cloudRadius * 0.7;
  });

  const iterations = 45;
  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 0.5 * (1 - iter / iterations);
    for (let i = 0; i < n; i++) {
      const nodeA = nodes[i];
      let fx = 0;
      let fy = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const nodeB = nodes[j];
        const dx = nodeA.x - nodeB.x;
        const dy = nodeA.y - nodeB.y;
        const dist = Math.hypot(dx, dy) || 1;

        if (repel.has(`${Math.min(i, j)}-${Math.max(i, j)}`)) {
          const minDist = targetSpacing * 1.8;
          if (dist < minDist) {
            fx += (dx / dist) * (minDist - dist) * 0.4;
            fy += (dy / dist) * (minDist - dist) * 0.4;
          }
          continue;
        }

        const weight = conn[i][j];
        if (weight > 0.2) {
          const idealDist = targetSpacing * (1 - Math.min(weight, 1) * 0.6);
          const delta = dist - idealDist;
          fx -= (dx / dist) * delta * Math.min(weight, 1.3) * 0.35;
          fy -= (dy / dist) * delta * Math.min(weight, 1.3) * 0.35;
        } else if (dist < targetSpacing * 0.5) {
          fx += (dx / dist) * 18;
          fy += (dy / dist) * 18;
        }
      }
      nodeA.x += fx * alpha;
      nodeA.y += fy * alpha;
    }
  }
}

const MATH_SYMBOLS = ["\\lor", "\\land", "\\neg", "\\implies", "\\iff", "\\sum", "\\prod", "\\int", "\\det", "\\in", "\\subset", "\\forall", "\\exists", "\\lim", "\\to"];

/** MODE 6: Formula & Symbol Matrix - clusters by which family of LaTeX operators dominates a note. */
function applyFormulaProjection({ nodes, nodeSpacing, cloudSpacing }: ProjectionParams): void {
  const n = nodes.length;
  const targetSpacing = nodeSpacing || 180;
  const cloudRadius = cloudSpacing || 550;

  const symbolVectors = nodes.map((node) => {
    const text = `${node.content || ""} ${(node.latexFormulas || []).join(" ")}`;
    const vec = new Float64Array(MATH_SYMBOLS.length);
    MATH_SYMBOLS.forEach((sym, idx) => {
      vec[idx] = text.split(sym).length - 1;
    });
    return vec;
  });

  nodes.forEach((node, i) => {
    const vecA = symbolVectors[i];
    const logicCount = vecA[0] + vecA[1] + vecA[2] + vecA[3] + vecA[4];
    const sumCount = vecA[5] + vecA[6] + vecA[13] + vecA[14];
    const setCount = vecA[9] + vecA[10] + vecA[11] + vecA[12];
    const calcCount = vecA[7] + vecA[8];

    let clusterAngle: number;
    if (logicCount > sumCount && logicCount > setCount && logicCount > calcCount) clusterAngle = 0;
    else if (sumCount >= logicCount && sumCount > setCount && sumCount > calcCount) clusterAngle = Math.PI * 0.5;
    else if (setCount >= logicCount && setCount >= sumCount && setCount > calcCount) clusterAngle = Math.PI;
    else clusterAngle = Math.PI * 1.5;

    const hash = hashString(node.id);
    const r = cloudRadius * 0.75 + ((Math.abs(hash) % 120) - 60);
    const a = clusterAngle + ((Math.abs(hash >> 3) % 40) - 20) * (Math.PI / 180);
    node.x = Math.cos(a) * r;
    node.y = Math.sin(a) * r;
  });

  const iterations = 30;
  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 0.5 * (1 - iter / iterations);
    for (let i = 0; i < n; i++) {
      const nodeA = nodes[i];
      let fx = 0;
      let fy = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const nodeB = nodes[j];
        const dx = nodeA.x - nodeB.x;
        const dy = nodeA.y - nodeB.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < targetSpacing * 0.6) {
          fx += (dx / dist) * 15;
          fy += (dy / dist) * 15;
        }
      }
      nodeA.x += fx * alpha;
      nodeA.y += fy * alpha;
    }
  }
}

/** MODE 7: LLM Semantic Topic Map - static radial placement around cloudId-derived anchors, no force iteration. */
function applySemanticProjection({ nodes, nodeSpacing, cloudSpacing }: ProjectionParams): void {
  const n = nodes.length;
  const cloudRadius = cloudSpacing || 550;
  const targetSpacing = nodeSpacing || 180;
  const numTopicAnchors = Math.max(3, Math.min(6, Math.floor(Math.sqrt(n))));

  nodes.forEach((node, i) => {
    const topicIdx = node.cloudId !== undefined ? node.cloudId % numTopicAnchors : i % numTopicAnchors;
    const angle = (topicIdx / numTopicAnchors) * Math.PI * 2;
    const cX = Math.cos(angle) * cloudRadius;
    const cY = Math.sin(angle) * cloudRadius;
    const hash = hashString(node.id);
    node.x = cX + ((Math.abs(hash) % targetSpacing) - targetSpacing * 0.5);
    node.y = cY + ((Math.abs(hash >> 3) % targetSpacing) - targetSpacing * 0.5);
  });
}

const FLOW_TYPE_RANK: Record<string, number> = {
  definition: 0,
  concept: 1,
  theorem: 2,
  relation: 3,
  synthesis: 4,
  question: 2,
  course: 0,
  source: 0,
};

/** MODE 2: Dependency Flow - static vertical rank by note type, no force iteration. */
function applyFlowProjection({ nodes }: ProjectionParams): void {
  nodes.forEach((node) => {
    const rank = FLOW_TYPE_RANK[node.type] ?? 2;
    const hash = hashString(node.id);
    node.x = (Math.abs(hash) % 600) - 300;
    node.y = -250 + rank * 130 + ((Math.abs(hash >> 3) % 80) - 40);
  });
}

/** MODE 3: Pure Graph - force layout driven only by the hybrid similarity matrix, fixed 120px ideal distance. */
function applyGraphProjection({ nodes, matrix }: ProjectionParams): void {
  const n = nodes.length;
  nodes.forEach((node, i) => {
    const angle = (i / n) * Math.PI * 2;
    node.x = Math.cos(angle) * 200;
    node.y = Math.sin(angle) * 200;
  });

  const iterations = 35;
  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 0.5 * (1 - iter / iterations);
    for (let i = 0; i < n; i++) {
      const nodeA = nodes[i];
      let fx = 0;
      let fy = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const nodeB = nodes[j];
        const dx = nodeA.x - nodeB.x;
        const dy = nodeA.y - nodeB.y;
        const dist = Math.hypot(dx, dy) || 1;
        const sim = matrix[i][j];
        if (sim > 0.2) {
          const delta = dist - 120;
          fx -= (dx / dist) * delta * sim * 0.3;
          fy -= (dy / dist) * delta * sim * 0.3;
        } else if (dist < 90) {
          fx += (dx / dist) * 16;
          fy += (dy / dist) * 16;
        }
      }
      nodeA.x += fx * alpha;
      nodeA.y += fy * alpha;
    }
  }
}

const PROJECTIONS: Record<ProjectionMode, (params: ProjectionParams) => void> = {
  cloud: applyCloudProjection,
  umap: applyUmapProjection,
  node2vec: applyNode2VecProjection,
  formula: applyFormulaProjection,
  semantic: applySemanticProjection,
  flow: applyFlowProjection,
  graph: applyGraphProjection,
};

/** Mutates node.x/y (and cloud mode also anchorX/anchorY) in place, matching the original's mutation style. */
export function applyProjection(mode: ProjectionMode, params: ProjectionParams): void {
  (PROJECTIONS[mode] || PROJECTIONS.cloud)(params);
}
