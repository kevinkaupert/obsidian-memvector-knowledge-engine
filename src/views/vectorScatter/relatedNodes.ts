import type { RelationEdge, ScatterNode } from "./types";

/** Every other note connected to `focusNode` - via a raw [[WikiLink]] in either direction, or a typed Memgraph relation edge. */
export function computeRelatedNodeIds(nodes: ScatterNode[], relationEdges: RelationEdge[], focusNode: ScatterNode): Set<string> {
  const nodeMap = new Map(nodes.map((n) => [n.id.toLowerCase(), n]));
  const focusId = focusNode.id.toLowerCase();
  const focusLinks = new Set(focusNode.links.map((l) => l.toLowerCase()));
  const related = new Set<string>();

  nodes.forEach((n) => {
    if (n === focusNode) return;
    const nId = n.id.toLowerCase();
    const linksToFocus = n.links.some((l) => l.toLowerCase() === focusId);
    if (focusLinks.has(nId) || linksToFocus) related.add(n.id);
  });

  relationEdges.forEach((e) => {
    if (e.srcId === focusId) {
      const other = nodeMap.get(e.tgtId);
      if (other) related.add(other.id);
    } else if (e.tgtId === focusId) {
      const other = nodeMap.get(e.srcId);
      if (other) related.add(other.id);
    }
  });

  return related;
}

/** Union of computeRelatedNodeIds across every currently selected node, falling back to the hovered node when nothing is selected. */
export function computeFocusRelatedIds(
  nodes: ScatterNode[],
  relationEdges: RelationEdge[],
  selectedNodeIds: Set<string>,
  hoveredNode: ScatterNode | null
): Set<string> {
  const focusNodes = nodes.filter((n) => selectedNodeIds.has(n.id));
  if (focusNodes.length === 0 && hoveredNode) focusNodes.push(hoveredNode);

  const related = new Set<string>();
  focusNodes.forEach((f) => {
    computeRelatedNodeIds(nodes, relationEdges, f).forEach((id) => related.add(id));
  });
  return related;
}
