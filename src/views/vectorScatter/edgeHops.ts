import type { RelationEdge, ScatterNode } from "./types";

/**
 * Purpose: Computes the set of note IDs reachable within a given hop radius across typed relation edges.
 */
export function computeHopReachableNodeIds(
  relationEdges: RelationEdge[],
  nodeMap: Map<string, ScatterNode>,
  seedIds: Set<string>,
  hops: number
): Set<string> {
  if (seedIds.size === 0 || hops <= 0) return new Set(seedIds);

  let frontier = new Set([...seedIds].map((id) => id.toLowerCase()));
  const visited = new Set(frontier);

  for (let i = 1; i < hops; i++) {
    const next = new Set<string>();
    relationEdges.forEach((e) => {
      const src = e.srcId.toLowerCase();
      const tgt = e.tgtId.toLowerCase();
      if (frontier.has(src) && !visited.has(tgt)) next.add(tgt);
      if (frontier.has(tgt) && !visited.has(src)) next.add(src);
    });
    if (next.size === 0) break;
    next.forEach((id) => visited.add(id));
    frontier = next;
  }

  const result = new Set<string>();
  visited.forEach((lowerId) => result.add(nodeMap.get(lowerId)?.id || lowerId));
  return result;
}
