import type { MemVectorSettings } from "../../../settings/types";
import type { RelationEdge, ScatterNode } from "../types";
import { assignClouds } from "./cloudAssignment";
import { applyGraphVectorProjection } from "./projections";
import { buildSimilarityMatrix } from "./similarity";

export function applyVectorLayout(
  nodes: ScatterNode[],
  settings: MemVectorSettings,
  nodeSpacing: number,
  cloudSpacing: number,
  relationEdges: RelationEdge[]
): void {
  if (!nodes || nodes.length === 0) return;

  const isMath = settings.knowledgeDomain === "math";
  const normalized = {
    vector: 0.5,
    wikiLinks: 0.3,
    folder: 0.1,
    semantics: 0.1,
  };

  const matrix = buildSimilarityMatrix(nodes, normalized, isMath);
  assignClouds(nodes, matrix);

  applyGraphVectorProjection({
    nodes,
    matrix,
    nodeSpacing: nodeSpacing || 160,
    cloudSpacing: cloudSpacing || 320,
    relationEdges,
  });
}

