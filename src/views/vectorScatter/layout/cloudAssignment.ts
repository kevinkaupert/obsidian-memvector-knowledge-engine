import type { ScatterNode } from "../types";

/**
 * Assigns each node to one of `sqrt(n)`-many topic cluster centroids by
 * highest hybrid similarity, and sets cloudId and cloudLabel (centroid's title).
 */
export function assignClouds(nodes: ScatterNode[], matrix: number[][]): void {
  const n = nodes.length;
  if (n === 0) return;

  const numClouds = Math.max(2, Math.min(8, Math.floor(Math.sqrt(n))));
  if (n <= numClouds) {
    nodes.forEach((node) => {
      node.cloudId = 0;
      node.cloudLabel = nodes[0].title;
    });
    return;
  }

  // Pick diverse centroids (k-means++ style by least similarity to already picked centroids)
  const centroidIndices: number[] = [0];
  while (centroidIndices.length < numClouds) {
    let minMaxSim = Infinity;
    let bestIdx = -1;
    for (let i = 0; i < n; i++) {
      if (centroidIndices.includes(i)) continue;
      const maxSimToCentroids = Math.max(...centroidIndices.map((cIdx) => matrix[i][cIdx]));
      if (maxSimToCentroids < minMaxSim) {
        minMaxSim = maxSimToCentroids;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break;
    centroidIndices.push(bestIdx);
  }

  nodes.forEach((node, i) => {
    let maxSim = -1;
    let bestCloud = 0;
    centroidIndices.forEach((cIdx, cloudIdx) => {
      const sim = matrix[i][cIdx];
      if (sim > maxSim) {
        maxSim = sim;
        bestCloud = cloudIdx;
      }
    });
    node.cloudId = bestCloud;
    node.cloudLabel = nodes[centroidIndices[bestCloud]]?.title || `Cluster ${bestCloud + 1}`;
  });
}

