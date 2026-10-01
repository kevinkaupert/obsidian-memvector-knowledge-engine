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
 * Purpose: Computes the rescaled similarity matrix and assigns clusters, without moving any node.
 * Architecture: `fixedBounds` keeps the rescale of the last full pass, so a local adjustment does not change the scale
 * of every pair; without it the bounds are derived from the current vault.
 */
export function prepareLayoutModel(nodes: ScatterNode[], settings: MemVectorSettings, fixedBounds?: RescaleBounds | null): LayoutModel {
  const isMath = settings.knowledgeDomain === "math";
  const rawMatrix = buildSimilarityMatrix(nodes, SIMILARITY_WEIGHTS, isMath);
  const bounds = fixedBounds ?? computeRescaleBounds(rawMatrix);
  const matrix = rescaleSimilarityMatrix(rawMatrix, bounds);
  const centroidIds = assignClouds(nodes, matrix);
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
