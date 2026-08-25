import type { MemVectorSettings } from "../../../settings/types";
import type { RelationEdge, ScatterNode } from "../types";
import { assignClouds } from "./cloudAssignment";
import { applyProjection, type ProjectionMode } from "./projections";
import { buildSimilarityMatrix } from "./similarity";

export function applyVectorLayout(
  nodes: ScatterNode[],
  settings: MemVectorSettings,
  projectionMode: ProjectionMode,
  nodeSpacing: number,
  cloudSpacing: number,
  relationEdges: RelationEdge[]
): void {
  if (!nodes || nodes.length === 0) return;

  const isMath = settings.knowledgeDomain === "math";
  const weights = {
    vector: (settings.weightVector ?? 50) / 100,
    wikiLinks: (settings.weightWikiLinks ?? 30) / 100,
    folder: (settings.weightFolder ?? 10) / 100,
    semantics: (settings.weightSemantics ?? 10) / 100,
  };
  const total = weights.vector + weights.wikiLinks + weights.folder + weights.semantics || 1;
  const normalized = {
    vector: weights.vector / total,
    wikiLinks: weights.wikiLinks / total,
    folder: weights.folder / total,
    semantics: weights.semantics / total,
  };

  const matrix = buildSimilarityMatrix(nodes, normalized, isMath);
  assignClouds(nodes, matrix, settings.cloudNamingMode === "llm");

  applyProjection(projectionMode || "cloud", {
    nodes,
    matrix,
    nodeSpacing: nodeSpacing || 160,
    cloudSpacing: cloudSpacing || 320,
    relationEdges,
  });
}
