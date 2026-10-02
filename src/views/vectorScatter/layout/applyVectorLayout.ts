import type { MemVectorSettings } from "../../../settings/types";
import type { RelationTermDef } from "../../../relationVocabulary/types";
import type { RelationEdge, ScatterNode } from "../types";
import { assignClouds } from "./cloudAssignment";
import { applyGraphVectorProjection } from "./projections";
import { buildSimilarityMatrix, computeRescaleBounds, rescaleSimilarityMatrix, type RescaleBounds } from "./similarity";

/** Blend of the hybrid similarity components (sums to 1). */
const SIMILARITY_WEIGHTS = {
  vector: 0.5,
  wikiLinks: 0.3,
  folder: 0.1,
  semantics: 0.1,
};

/** Rescaled similarity matrix plus the state needed to keep its scale and the cluster assignment. */
export interface LayoutModel {
  matrix: number[][];
  bounds: RescaleBounds | null;
  /** Ids of the cluster centroid nodes, in cloud id order. */
  centroidIds: string[];
}

/**
 * Purpose: Computes the rescaled similarity matrix and, unless told to keep them, assigns clusters - without moving
 * any node.
 * Architecture: `fixedBounds` keeps the rescale of the last full pass and `assignClusters: false` keeps the cluster
 * assignment, so a local adjustment changes neither the scale of every pair nor every cluster (ADR-0006). Without
 * them the bounds and clusters are derived from the current vault.
 */
export function prepareLayoutModel(
  nodes: ScatterNode[],
  settings: MemVectorSettings,
  options: { fixedBounds?: RescaleBounds | null; assignClusters?: boolean } = {}
): LayoutModel {
  const isMath = settings.knowledgeDomain === "math";
  const rawMatrix = buildSimilarityMatrix(nodes, SIMILARITY_WEIGHTS, isMath);
  const bounds = options.fixedBounds ?? computeRescaleBounds(rawMatrix);
  const matrix = rescaleSimilarityMatrix(rawMatrix, bounds);
  const centroidIds = options.assignClusters === false ? [] : assignClouds(nodes, matrix);
  return { matrix, bounds, centroidIds };
}

/**
 * Purpose: Computes similarity matrix, rescales to vault distribution, clusters, and applies 2D vector force projection to scatter nodes.
 */
export function applyVectorLayout(
  nodes: ScatterNode[],
  settings: MemVectorSettings,
  nodeSpacing: number,
  cloudSpacing: number,
  relationEdges: RelationEdge[],
  vocabulary?: RelationTermDef[]
): LayoutModel {
  if (!nodes || nodes.length === 0) return { matrix: [], bounds: null, centroidIds: [] };

  // Keep the matrix, centroid selection and force iteration in the same canonical order.
  nodes.sort((a, b) => a.path.localeCompare(b.path));
  const model = prepareLayoutModel(nodes, settings);

  applyGraphVectorProjection({
    nodes,
    matrix: model.matrix,
    nodeSpacing: nodeSpacing || settings.scatterNodeSpacing || 350,
    cloudSpacing: cloudSpacing || settings.scatterCloudSpacing || 800,
    relationEdges,
    includeWikiLinksAsRelations: settings.includeWikiLinksAsRelations,
    vocabulary,
  });
  return model;
}
