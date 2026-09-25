import { COLLAPSED_SLOT, computeControlPoint, computeEdgeSlots, distanceToCurve, groupKeyFor } from "./edgeGrouping";
import { computeHopReachableNodeIds } from "./edgeHops";
import { buildNodeMap, type RelationEdge, type ScatterNode } from "./types";

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

/** Generous first-pass radius (px) for noticing a multi-edge bundle at all, before fanning out to test its individual strands precisely - deliberately larger than `threshold`, so a bundle drawn collapsed to one line is still easy to find. */
const BUNDLE_APPROACH_PX = 14;

/**
 * Purpose: Hit-tests mouse coordinates against curved relation edges within the active hop radius on the 2D canvas.
 */
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
  const nodeMap = buildNodeMap(nodes);
  const reachable = hops === 0 ? null : computeHopReachableNodeIds(relationEdges, nodeMap, activeNodeIds, hops);
  const slots = computeEdgeSlots(relationEdges);

  const groups = new Map<string, RelationEdge[]>();
  for (const edge of relationEdges) {
    if (edge.relType === "RELATED_TO") continue;
    const srcNode = nodeMap.get(edge.srcId.toLowerCase());
    const tgtNode = nodeMap.get(edge.tgtId.toLowerCase());
    if (!srcNode || !tgtNode) continue;
    if (reachable && !reachable.has(srcNode.id) && !reachable.has(tgtNode.id)) continue;
    const key = groupKeyFor(edge);
    const group = groups.get(key);
    if (group) group.push(edge);
    else groups.set(key, [edge]);
  }

  for (const group of groups.values()) {
    const first = group[0];
    const srcNode = nodeMap.get(first.srcId.toLowerCase())!;
    const tgtNode = nodeMap.get(first.tgtId.toLowerCase())!;
    const p1 = worldToScreen(srcNode.x, srcNode.y, zoom, pan);
    const p2 = worldToScreen(tgtNode.x, tgtNode.y, zoom, pan);

    if (group.length === 1) {
      const control = computeControlPoint(p1, p2, COLLAPSED_SLOT);
      if (distanceToCurve(mouseX, mouseY, p1, control, p2) <= threshold) return first;
      continue;
    }

    const collapsedControl = computeControlPoint(p1, p2, COLLAPSED_SLOT);
    if (distanceToCurve(mouseX, mouseY, p1, collapsedControl, p2) > BUNDLE_APPROACH_PX) continue;

    // Once within approach range, pick whichever fanned strand is nearest
    // rather than requiring a pixel-precise hit on one of them - fanning out
    // moves the curves out from under a cursor that was aimed at the
    // collapsed line, and a dead zone between them would otherwise flicker
    // the bundle open and shut every time the mouse lands in that gap.
    let nearest: RelationEdge | null = null;
    let nearestDist = Infinity;
    for (const edge of group) {
      const slot = slots.get(edge)!;
      const control = computeControlPoint(p1, p2, slot);
      const dist = distanceToCurve(mouseX, mouseY, p1, control, p2);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = edge;
      }
    }
    if (nearest && nearestDist <= BUNDLE_APPROACH_PX) return nearest;
  }
  return null;
}
