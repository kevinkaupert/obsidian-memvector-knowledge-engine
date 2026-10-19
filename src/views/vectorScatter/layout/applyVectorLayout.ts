import type { MemVectorSettings } from "../../../settings/types";
import type { RelationTermDef } from "../../../relationVocabulary/types";
import type { RelationEdge, ScatterNode } from "../types";
import { assignClouds } from "./cloudAssignment";
import { applyGraphVectorProjection } from "./projections";
import type { RescaleBounds } from "./similarity";
import { buildLayoutSignals, layoutWeightsFrom, type LayoutSignals, type ResolvedLinks } from "./signals";

/** Pair signals of one pass plus the state needed to keep the semantic scale and the cluster assignment. */
export interface LayoutModel extends LayoutSignals {
  /** Matrix row/column paths, independent of the caller's node-array order. */
  nodePaths: string[];
  /** Ids of the cluster centroid nodes, in cloud id order. */
  centroidIds: string[];
}

/** Keep node identities but never reorder the caller's array. Sorted inputs need no second sort. */
export function copyNodesInPathOrder(nodes: ScatterNode[]): ScatterNode[] {
  const ordered = nodes.slice();
  if (ordered.some((node, i) => i > 0 && ordered[i - 1].path.localeCompare(node.path, "en") > 0)) {
    ordered.sort((a, b) => a.path.localeCompare(b.path, "en"));
  }
  return ordered;
}

/** Inputs of the pair signals besides the nodes. */
export interface SignalInputs {
  relationEdges: RelationEdge[];
  vocabulary?: RelationTermDef[];
  links?: ResolvedLinks;
}

/**
 * Purpose: Computes the pair signals (signals.ts) and, unless told to keep them, assigns clusters - without moving any
 * node.
 * Architecture: `fixedBounds` keeps the semantic rescale of the last full pass and `assignClusters: false` keeps the
 * cluster assignment, so a local adjustment changes neither the scale of every pair nor every cluster (ADR-0006).
 */
export function prepareLayoutModel(
  nodes: ScatterNode[],
  settings: MemVectorSettings,
  inputs: SignalInputs,
  options: { fixedBounds?: RescaleBounds | null; assignClusters?: boolean } = {}
): LayoutModel {
  const weights = layoutWeightsFrom(settings);
  const signals = buildLayoutSignals(nodes, inputs.relationEdges, inputs.vocabulary, inputs.links, weights, options.fixedBounds);
  const centroidIds = options.assignClusters === false ? [] : assignClouds(nodes, signals.affinity, weights.semantic > 0);
  return { ...signals, nodePaths: nodes.map((node) => node.path), centroidIds };
}

/**
 * Purpose: Computes the pair signals, clusters, and applies the 2D force projection to the scatter nodes.
 */
export function applyVectorLayout(
  nodes: ScatterNode[],
  settings: MemVectorSettings,
  nodeSpacing: number,
  cloudSpacing: number,
  inputs: SignalInputs
): LayoutModel {
  if (!nodes || nodes.length === 0) {
    return { affinity: [], weightFactor: [], repel: new Set(), bounds: null, nodePaths: [], centroidIds: [] };
  }
  // Keep the matrix, centroid selection and force iteration in the same canonical order.
  nodes = copyNodesInPathOrder(nodes);
  const model = prepareLayoutModel(nodes, settings, inputs);
  const semantic = layoutWeightsFrom(settings).semantic > 0;
  applyGraphVectorProjection({
    nodes,
    signals: model,
    nodeSpacing,
    cloudSpacing,
    embeddingPca: semantic,
    preferEmbeddedCentroids: semantic,
  });
  return model;
}
