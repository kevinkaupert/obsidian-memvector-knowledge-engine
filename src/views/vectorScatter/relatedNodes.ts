import type { RelationEdge, ScatterNode } from "./types";

/** How a note is connected to the current focus - drives the glow color in the "ink" style. */
export type RelationKind = "wikilink" | "memgraph" | "both";

function upsertKind(map: Map<string, RelationKind>, id: string, kind: RelationKind): void {
  const existing = map.get(id);
  map.set(id, !existing || existing === kind ? kind : "both");
}

/** Every other note connected to `focusNode`, tagged by how: a raw [[WikiLink]] in either direction, a typed Memgraph relation edge, or both. */
export function computeRelatedNodeKinds(nodes: ScatterNode[], relationEdges: RelationEdge[], focusNode: ScatterNode): Map<string, RelationKind> {
  const nodeMap = new Map(nodes.map((n) => [n.id.toLowerCase(), n]));
  const focusId = focusNode.id.toLowerCase();
  const focusLinks = new Set(focusNode.links.map((l) => l.toLowerCase()));
  const result = new Map<string, RelationKind>();

  nodes.forEach((n) => {
    if (n === focusNode) return;
    const nId = n.id.toLowerCase();
    const linksToFocus = n.links.some((l) => l.toLowerCase() === focusId);
    if (focusLinks.has(nId) || linksToFocus) upsertKind(result, n.id, "wikilink");
  });

  relationEdges.forEach((e) => {
    if (e.srcId === focusId) {
      const other = nodeMap.get(e.tgtId);
      if (other) upsertKind(result, other.id, "memgraph");
    } else if (e.tgtId === focusId) {
      const other = nodeMap.get(e.srcId);
      if (other) upsertKind(result, other.id, "memgraph");
    }
  });

  return result;
}

/** Union of computeRelatedNodeKinds across every currently selected node, falling back to the hovered node when nothing is selected. */
export function computeFocusRelatedKinds(
  nodes: ScatterNode[],
  relationEdges: RelationEdge[],
  selectedNodeIds: Set<string>,
  hoveredNode: ScatterNode | null
): Map<string, RelationKind> {
  const focusNodes = nodes.filter((n) => selectedNodeIds.has(n.id));
  if (focusNodes.length === 0 && hoveredNode) focusNodes.push(hoveredNode);

  const merged = new Map<string, RelationKind>();
  focusNodes.forEach((f) => {
    computeRelatedNodeKinds(nodes, relationEdges, f).forEach((kind, id) => upsertKind(merged, id, kind));
  });
  return merged;
}
