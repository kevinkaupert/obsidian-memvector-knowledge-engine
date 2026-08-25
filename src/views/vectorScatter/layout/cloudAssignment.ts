import type { ScatterNode } from "../types";

function getLLMTopicLabel(cloudNodes: ScatterNode[], fallbackTitle: string): string {
  const text = cloudNodes.map((n) => `${n.title} ${(n.latexFormulas || []).join(" ")}`.toLowerCase()).join(" ");
  if (text.includes("disjunktion") || text.includes("konjunktion") || text.includes("aequivalenz") || text.includes("implikation") || text.includes("bior")) {
    return "Aussagenlogik & Operatoren";
  }
  if (text.includes("gauss") || text.includes("summe") || text.includes("induktion") || text.includes("arithmet")) {
    return "Arithmetik & Summenformeln";
  }
  if (text.includes("menge") || text.includes("teilmenge") || text.includes("vereinigung") || text.includes("schnitt")) {
    return "Mengenlehre & Relationen";
  }
  if (text.includes("integral") || text.includes("ableitung") || text.includes("grenzwert") || text.includes("stetig")) {
    return "Analysis & Funktionsterme";
  }
  if (cloudNodes.length >= 2) {
    return `${cloudNodes[0].title} & ${cloudNodes[1].title}`;
  }
  return fallbackTitle;
}

/**
 * Assigns each node to one of `sqrt(n)`-many "topic cloud" centroids by
 * highest similarity, then labels each cloud (either by its centroid's
 * title, or - for cloudNamingMode "llm" - a keyword-heuristic label; despite
 * the name this isn't an actual LLM call, matching the original).
 * Mutates cloudId/cloudLabel on each node, same as the original.
 */
export function assignClouds(nodes: ScatterNode[], matrix: number[][], useLlmLabels: boolean): void {
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
  });

  const cloudNodesMap = new Map<number, ScatterNode[]>();
  nodes.forEach((n2) => {
    const cloudId = n2.cloudId as number;
    if (!cloudNodesMap.has(cloudId)) cloudNodesMap.set(cloudId, []);
    cloudNodesMap.get(cloudId)!.push(n2);
  });

  nodes.forEach((node) => {
    const cloudId = node.cloudId as number;
    const fallback = centroids[cloudId]?.title || `Thema ${cloudId + 1}`;
    if (useLlmLabels) {
      const cNodes = cloudNodesMap.get(cloudId) || [];
      node.cloudLabel = getLLMTopicLabel(cNodes, fallback);
    } else {
      node.cloudLabel = fallback;
    }
  });
}
