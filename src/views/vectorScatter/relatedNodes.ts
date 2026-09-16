import type { RelationEdge, ScatterNode } from "./types";

/** How many WikiLink vs. Memgraph connections tie a note to the current focus - drives a proportionally split glow color in the "ink" style. */
export interface RelationTally {
  wikilink: number;
  memgraph: number;
}

function bump(tallies: Map<string, RelationTally>, id: string, key: keyof RelationTally): void {
  const t = tallies.get(id) || { wikilink: 0, memgraph: 0 };
  t[key] += 1;
  tallies.set(id, t);
}

/**
 * Purpose: Tallies distinct connections (WikiLinks and typed relation edges) between a focal note and other notes in the graph.
 */
export function computeRelationTally(nodes: ScatterNode[], relationEdges: RelationEdge[], focusNode: ScatterNode): Map<string, RelationTally> {
  const nodeMap = new Map(nodes.map((n) => [n.id.toLowerCase(), n]));
  const focusId = focusNode.id.toLowerCase();
  const focusLinks = new Set(focusNode.links.map((l) => l.toLowerCase()));
  const tallies = new Map<string, RelationTally>();

  nodes.forEach((n) => {
    if (n === focusNode) return;
    // WikiLinks target basenames, not the canonical (path-based) id - match on basenameKey.
    if (focusLinks.has(n.basenameKey)) bump(tallies, n.id, "wikilink");
    if (n.links.some((l) => l.toLowerCase() === focusNode.basenameKey)) bump(tallies, n.id, "wikilink");
  });

  relationEdges.forEach((e) => {
    const src = e.srcId.toLowerCase();
    const tgt = e.tgtId.toLowerCase();
    if (src === focusId) {
      const other = nodeMap.get(tgt);
      if (other) bump(tallies, other.id, "memgraph");
    } else if (tgt === focusId) {
      const other = nodeMap.get(src);
      if (other) bump(tallies, other.id, "memgraph");
    }
  });

  return tallies;
}

/** Sums computeRelationTally across every currently selected note, falling back to the hovered note when nothing is selected. */
export function computeFocusRelationTallies(
  nodes: ScatterNode[],
  relationEdges: RelationEdge[],
  selectedNodeIds: Set<string>,
  hoveredNode: ScatterNode | null
): Map<string, RelationTally> {
  const focusNodes = nodes.filter((n) => selectedNodeIds.has(n.id));
  if (focusNodes.length === 0 && hoveredNode) focusNodes.push(hoveredNode);

  const merged = new Map<string, RelationTally>();
  focusNodes.forEach((f) => {
    computeRelationTally(nodes, relationEdges, f).forEach((tally, id) => {
      const existing = merged.get(id) || { wikilink: 0, memgraph: 0 };
      merged.set(id, { wikilink: existing.wikilink + tally.wikilink, memgraph: existing.memgraph + tally.memgraph });
    });
  });
  return merged;
}
