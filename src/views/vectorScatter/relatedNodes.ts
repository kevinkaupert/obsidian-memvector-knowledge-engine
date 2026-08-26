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
 * Tallies, per other note, how many distinct connections it has to `focusNode`:
 * a WikiLink counts once per direction (so a mutual link counts twice), a
 * Memgraph relation edge counts once per matching edge.
 */
export function computeRelationTally(nodes: ScatterNode[], relationEdges: RelationEdge[], focusNode: ScatterNode): Map<string, RelationTally> {
  const nodeMap = new Map(nodes.map((n) => [n.id.toLowerCase(), n]));
  const focusId = focusNode.id.toLowerCase();
  const focusLinks = new Set(focusNode.links.map((l) => l.toLowerCase()));
  const tallies = new Map<string, RelationTally>();

  nodes.forEach((n) => {
    if (n === focusNode) return;
    const nId = n.id.toLowerCase();
    if (focusLinks.has(nId)) bump(tallies, n.id, "wikilink");
    if (n.links.some((l) => l.toLowerCase() === focusId)) bump(tallies, n.id, "wikilink");
  });

  relationEdges.forEach((e) => {
    if (e.srcId === focusId) {
      const other = nodeMap.get(e.tgtId);
      if (other) bump(tallies, other.id, "memgraph");
    } else if (e.tgtId === focusId) {
      const other = nodeMap.get(e.srcId);
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
