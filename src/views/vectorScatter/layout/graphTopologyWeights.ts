import type { RelationEdge, ScatterNode } from "../types";

/** CONFLICTS_WITH is a direct semantic opposition - actively push those two notes apart rather than just declining to pull them together. */
const REPEL_TYPES = new Set(["CONFLICTS_WITH"]);
/** Pulls tighter than a generic typed relation: these mean "these are basically the same idea". */
const CLOSE_TYPES: Record<string, number> = {
  EQUIVALENT_TO: 1.3,
  ANALOGOUS_TO: 1.1,
};
const DEFAULT_RELATION_WEIGHT = 1.0;
const WIKILINK_WEIGHT = 0.7;
export const BASELINE_WEIGHT = 0.05;
const MAX_HOPS = 4;
/** Decayed attraction for notes that are close in the graph but not directly connected - a real hop-distance instead of the old binary linked/not-linked split. */
const HOP_DECAY: Record<number, number> = { 2: 0.45, 3: 0.22, 4: 0.1 };

export interface GraphTopologyWeights {
  /** n x n attraction weight matrix; BASELINE_WEIGHT for anything unreached within MAX_HOPS. */
  conn: Float64Array[];
  /** "i-j" (i<j, node array indices) pairs with a direct CONFLICTS_WITH edge - push apart instead of attract. */
  repel: Set<string>;
}

function edgeWeightForType(relType: string): number {
  return CLOSE_TYPES[relType] ?? DEFAULT_RELATION_WEIGHT;
}

/**
 * Builds an undirected graph from WikiLinks + typed relation edges, then
 * computes real BFS hop-distance from every node (capped at MAX_HOPS) instead
 * of the old three-tier "related / linked / else" split - a note two hops
 * away now visibly reads as closer than a wholly unconnected one, and
 * CONFLICTS_WITH/EQUIVALENT_TO/ANALOGOUS_TO shape the layout instead of every
 * relation type pulling equally hard.
 */
export function computeGraphTopologyWeights(nodes: ScatterNode[], relationEdges: RelationEdge[]): GraphTopologyWeights {
  const n = nodes.length;
  const idToIndex = new Map(nodes.map((node, i) => [node.id.toLowerCase(), i]));
  const adjacency: Map<number, number>[] = nodes.map(() => new Map<number, number>());
  const repel = new Set<string>();

  const addEdge = (i: number, j: number, weight: number): void => {
    adjacency[i].set(j, Math.max(adjacency[i].get(j) ?? 0, weight));
    adjacency[j].set(i, Math.max(adjacency[j].get(i) ?? 0, weight));
  };

  for (let i = 0; i < n; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < n; j++) {
      const b = nodes[j];
      const isLinked = (a.links && a.links.includes(b.id.toLowerCase())) || (b.links && b.links.includes(a.id.toLowerCase()));
      if (isLinked) addEdge(i, j, WIKILINK_WEIGHT);
    }
  }

  relationEdges.forEach((e) => {
    const i = idToIndex.get(e.srcId);
    const j = idToIndex.get(e.tgtId);
    if (i === undefined || j === undefined || i === j) return;
    if (REPEL_TYPES.has(e.relType)) {
      repel.add(`${Math.min(i, j)}-${Math.max(i, j)}`);
    } else {
      addEdge(i, j, edgeWeightForType(e.relType));
    }
  });

  const conn: Float64Array[] = nodes.map(() => new Float64Array(n).fill(BASELINE_WEIGHT));
  for (let start = 0; start < n; start++) {
    const dist = new Int8Array(n).fill(-1);
    dist[start] = 0;
    let frontier = [start];
    for (let hop = 1; hop <= MAX_HOPS && frontier.length > 0; hop++) {
      const next: number[] = [];
      for (const node of frontier) {
        adjacency[node].forEach((_weight, neighbor) => {
          if (dist[neighbor] === -1) {
            dist[neighbor] = hop;
            next.push(neighbor);
          }
        });
      }
      frontier = next;
    }
    for (let j = 0; j < n; j++) {
      if (j === start || dist[j] === -1) continue;
      conn[start][j] = dist[j] === 1 ? adjacency[start].get(j)! : (HOP_DECAY[dist[j]] ?? BASELINE_WEIGHT);
    }
  }

  return { conn, repel };
}
