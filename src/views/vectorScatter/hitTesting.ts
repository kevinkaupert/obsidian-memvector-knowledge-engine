import { computeHopReachableNodeIds } from "./edgeHops";
import type { RelationEdge, ScatterNode } from "./types";

export interface PanState {
  x: number;
  y: number;
}

export function worldToScreen(wx: number, wy: number, zoom: number, pan: PanState): { x: number; y: number } {
  return { x: wx * zoom + pan.x, y: wy * zoom + pan.y };
}

export function hitTest(nodes: ScatterNode[], mouseX: number, mouseY: number, zoom: number, pan: PanState): ScatterNode | null {
  for (const node of nodes) {
    const pos = worldToScreen(node.x, node.y, zoom, pan);
    if (Math.hypot(mouseX - pos.x, mouseY - pos.y) <= 12) return node;
  }
  return null;
}

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Only tests edges that rendering/drawEdges.ts would actually draw (within `hops` of a selected/hovered node, or all of them when hops=0) - matching its visibility rule, so nothing invisible is clickable. */
export function hitTestEdge(
  nodes: ScatterNode[],
  relationEdges: RelationEdge[],
  activeNodeIds: Set<string>,
  hops: number,
  mouseX: number,
  mouseY: number,
  zoom: number,
  pan: PanState,
  threshold = 8
): RelationEdge | null {
  if (hops !== 0 && activeNodeIds.size === 0) return null;
  const nodeMap = new Map(nodes.map((n) => [n.id.toLowerCase(), n]));
  const reachable = hops === 0 ? null : computeHopReachableNodeIds(relationEdges, nodeMap, activeNodeIds, hops);

  for (const edge of relationEdges) {
    if (edge.relType === "RELATED_TO") continue;
    const srcNode = nodeMap.get(edge.srcId);
    const tgtNode = nodeMap.get(edge.tgtId);
    if (!srcNode || !tgtNode) continue;
    if (reachable && !reachable.has(srcNode.id) && !reachable.has(tgtNode.id)) continue;

    const p1 = worldToScreen(srcNode.x, srcNode.y, zoom, pan);
    const p2 = worldToScreen(tgtNode.x, tgtNode.y, zoom, pan);
    if (distanceToSegment(mouseX, mouseY, p1.x, p1.y, p2.x, p2.y) <= threshold) return edge;
  }
  return null;
}
