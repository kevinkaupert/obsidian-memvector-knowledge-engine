/**
 * Purpose: Test support for projection tests written against a plain similarity matrix: turns the matrix into layout
 * signals by the rules of signals.ts (semantic = matrix value squared, plus typed relations, summed and capped at 1).
 * Not imported by production code.
 */
import type { RelationTermDef } from "../../../relationVocabulary/types";
import type { RelationEdge, ScatterNode } from "../types";
import { applyGraphVectorProjection, type ProjectionParams, type ProjectionResult } from "./projections";
import { DEFAULT_LAYOUT_WEIGHTS, combineAffinity, relationSignal, relationWeightFactor, type LayoutSignals } from "./signals";

export function signalsFromMatrix(nodes: ScatterNode[], matrix: number[][], relationEdges: RelationEdge[] = [], vocabulary?: RelationTermDef[]): Pick<LayoutSignals, "affinity" | "weightFactor" | "repel"> {
  const n = nodes.length;
  const relation = relationSignal(nodes, relationEdges, vocabulary);
  const affinity = nodes.map((_, i) => nodes.map((__, j) => (i === j ? 1 : combineAffinity(matrix[i][j] * matrix[i][j], 0, relation.weight[i][j], DEFAULT_LAYOUT_WEIGHTS))));
  const weightFactor = nodes.map((_, i) => Float64Array.from({ length: n }, (__, j) => relationWeightFactor(relation.weight[i][j], DEFAULT_LAYOUT_WEIGHTS)));
  return { affinity, weightFactor, repel: relation.repel };
}

export type MatrixProjectionParams = Omit<ProjectionParams, "signals"> & {
  matrix: number[][];
  relationEdges?: RelationEdge[];
  vocabulary?: RelationTermDef[];
};

/** Runs the projection on signals built from a plain similarity matrix. */
export function project({ matrix, relationEdges, vocabulary, ...rest }: MatrixProjectionParams): ProjectionResult {
  return applyGraphVectorProjection({ ...rest, signals: signalsFromMatrix(rest.nodes, matrix, relationEdges, vocabulary) });
}
