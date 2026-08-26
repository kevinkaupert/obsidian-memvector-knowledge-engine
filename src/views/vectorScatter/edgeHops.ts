import type { RelationEdge, ScatterNode } from "./types";

/**
 * Every note within `hops` steps of `seedIds` by walking relationEdges - hops=1
 * is just the seed itself (direct edges only, the original behavior), hops=2
 * also reaches one neighbor further out, etc. `nodeMap` is keyed by
 * id.toLowerCase() (RelationEdge ids are already lowercased) and is used to
 * translate results back to the real, actually-cased ScatterNode.id.
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
      if (frontier.has(e.srcId) && !visited.has(e.tgtId)) next.add(e.tgtId);
      if (frontier.has(e.tgtId) && !visited.has(e.srcId)) next.add(e.srcId);
    });
    if (next.size === 0) break;
    next.forEach((id) => visited.add(id));
    frontier = next;
  }

  const result = new Set<string>();
  visited.forEach((lowerId) => result.add(nodeMap.get(lowerId)?.id || lowerId));
  return result;
}
