import type { ScatterNode } from "../types";

/**
 * Assigns each node to one of `sqrt(n)`-many topic cluster centroids by
 * highest hybrid similarity, and sets cloudId and cloudLabel (centroid's title).
 */
export function assignClouds(nodes: ScatterNode[], matrix: number[][]): void {
  const n = nodes.length;
  if (n === 0) return;

  const numClouds = Math.max(2, Math.min(8, Math.floor(Math.sqrt(n))));
  const centroids: ScatterNode[] = [];
  const step = Math.floor(n / numClouds);
  for (let k = 0; k < numClouds; k++) {
    centroids.push(nodes[Math.min(n - 1, k * step)]);
  }

  nodes.forEach((node, i) => {
    let maxSim = -1;
    let bestCloud = 0;
    centroids.forEach((cNode, cIdx) => {
      const sim = matrix[i][nodes.indexOf(cNode)];
      if (sim > maxSim) {
        maxSim = sim;
        bestCloud = cIdx;
      }
    });
    node.cloudId = bestCloud;
    node.cloudLabel = centroids[bestCloud]?.title || `Cluster ${bestCloud + 1}`;
  });
}

