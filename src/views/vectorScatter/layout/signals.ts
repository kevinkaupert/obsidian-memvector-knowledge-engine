/**
 * Purpose: The layout's signal model (Plan 0005 section 7, ADR-0008): three pair signals with one source each, mixed in
 * one place. A weight of 0 removes its signal from every consumer (spring, placement, mobile set, clusters).
 * Architecture: Pure; the view passes the resolved WikiLinks, so nothing here reads Obsidian. The relation weight above
 * 1 keeps its role as a weight factor (target distance, spring stiffness, collision clearance), as before.
 */
import type { MemVectorSettings } from "../../../settings/types";
import type { RelationTermDef } from "../../../relationVocabulary/types";
import type { RelationEdge, ScatterNode } from "../types";
import { buildLabelIndex, resolveRelationForce } from "./graphTopologyWeights";
import { computeRescaleBounds, type RescaleBounds } from "./similarity";
import { MAX_RELATION_WEIGHT_FACTOR } from "./layoutTunables";

/** Weight per signal; 0 switches a signal off everywhere. */
export interface LayoutWeights {
  semantic: number;
  links: number;
  relations: number;
}

export const DEFAULT_LAYOUT_WEIGHTS: LayoutWeights = { semantic: 1, links: 0.3, relations: 1 };

/** Purpose: The weights from the settings; a missing value takes its default, an explicit 0 stays 0. */
export function layoutWeightsFrom(settings: Partial<Pick<MemVectorSettings, "layoutWeightSemantic" | "layoutWeightLinks" | "layoutWeightRelations">>): LayoutWeights {
  const pick = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback);
  return {
    semantic: pick(settings.layoutWeightSemantic, DEFAULT_LAYOUT_WEIGHTS.semantic),
    links: pick(settings.layoutWeightLinks, DEFAULT_LAYOUT_WEIGHTS.links),
    relations: pick(settings.layoutWeightRelations, DEFAULT_LAYOUT_WEIGHTS.relations),
  };
}

/** Resolved targets of the WikiLinks in each note's text (metadata cache `links`, resolved by Obsidian; frontmatter links excluded). */
export type ResolvedLinks = ReadonlyMap<string, readonly string[]>;

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let k = 0; k < a.length; k++) {
    dot += a[k] * b[k];
    na += a[k] * a[k];
    nb += b[k] * b[k];
  }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
}

const hasVector = (node: ScatterNode) => (node.embedding?.length ?? 0) > 0;

/**
 * Purpose: Semantic signal per pair: embedding cosine, rescaled to [0,1] between the vault's lower and upper percentile
 * (section 2.2), then squared to filter background noise. 0 when either note has no vector.
 * Architecture: When the bounds cannot stretch (fewer than two embedded notes, negligible spread) the cosine is mapped
 * by (cos + 1) / 2. `fixedBounds` keeps the scale of the last free pass for bounded passes.
 */
export function semanticSignal(nodes: ScatterNode[], fixedBounds?: RescaleBounds | null): { matrix: number[][]; bounds: RescaleBounds | null } {
  const n = nodes.length;
  const raw: number[][] = nodes.map(() => new Array<number>(n).fill(0));
  const embedded: number[] = [];
  nodes.forEach((node, i) => {
    if (hasVector(node)) embedded.push(i);
  });
  for (let x = 0; x < embedded.length; x++) {
    for (let y = x + 1; y < embedded.length; y++) {
      const i = embedded[x];
      const j = embedded[y];
      const a = nodes[i].embedding!;
      const b = nodes[j].embedding!;
      const c = a.length === b.length ? cosine(a, b) : 0;
      raw[i][j] = c;
      raw[j][i] = c;
    }
  }
  const bounds = fixedBounds !== undefined ? fixedBounds : embedded.length >= 2 ? computeRescaleBounds(raw, embedded) : null;
  const spread = bounds ? bounds.high - bounds.low : 0;
  const matrix: number[][] = nodes.map(() => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    if (!hasVector(nodes[i])) continue;
    for (let j = i + 1; j < n; j++) {
      if (!hasVector(nodes[j])) continue;
      const scaled = bounds && spread > 1e-6 ? (raw[i][j] - bounds.low) / spread : (raw[i][j] + 1) / 2;
      const clamped = Math.max(0, Math.min(1, scaled));
      matrix[i][j] = clamped * clamped;
      matrix[j][i] = matrix[i][j];
    }
  }
  return { matrix, bounds: bounds ?? null };
}

/** Purpose: Link signal per pair: 1 when either note links the other in the resolved links, else 0. */
export function linkSignal(nodes: ScatterNode[], links: ResolvedLinks | undefined): Uint8Array[] {
  const n = nodes.length;
  const matrix = nodes.map(() => new Uint8Array(n));
  if (!links) return matrix;
  const indexOf = new Map(nodes.map((node, i) => [node.path, i]));
  nodes.forEach((node, i) => {
    for (const target of links.get(node.path) ?? []) {
      const j = indexOf.get(target);
      if (j === undefined || j === i) continue;
      matrix[i][j] = 1;
      matrix[j][i] = 1;
    }
  });
  return matrix;
}

/**
 * Purpose: Relation signal per pair: the strongest attracting typed-relation weight (vocabulary, bundled fallback), and
 * the pairs joined by a repelling relation ("i-j", i < j).
 */
export function relationSignal(
  nodes: ScatterNode[],
  relationEdges: RelationEdge[],
  vocabulary?: RelationTermDef[]
): { weight: Float64Array[]; repel: Set<string> } {
  const n = nodes.length;
  const weight = nodes.map(() => new Float64Array(n));
  const repel = new Set<string>();
  const idToIndex = new Map(nodes.map((node, i) => [node.id.toLowerCase(), i]));
  const labelIndex = buildLabelIndex(vocabulary);
  for (const e of relationEdges) {
    const i = idToIndex.get(e.srcId.toLowerCase());
    const j = idToIndex.get(e.tgtId.toLowerCase());
    if (i === undefined || j === undefined || i === j) continue;
    const force = resolveRelationForce(e.relType, labelIndex);
    if (force.repels) {
      repel.add(`${Math.min(i, j)}-${Math.max(i, j)}`);
    } else {
      weight[i][j] = Math.max(weight[i][j], force.weight);
      weight[j][i] = weight[i][j];
    }
  }
  return { weight, repel };
}

/** Purpose: The only place the signals are mixed: a = min(1, w_sem * semantic + w_link * link + w_rel * min(1, relation)). */
export function combineAffinity(semantic: number, link: number, relation: number, w: LayoutWeights): number {
  return Math.min(1, w.semantic * semantic + w.links * link + w.relations * Math.min(1, relation));
}

/** Purpose: Weight factor of a pair: how much a relation weight above 1 shortens the target distance (1 = none). */
export function relationWeightFactor(relation: number, w: LayoutWeights): number {
  return Math.min(MAX_RELATION_WEIGHT_FACTOR, Math.max(1, w.relations * relation));
}

/** Everything the projection and the engine read about pairs. */
export interface LayoutSignals {
  /** Combined affinity per pair, diagonal 1. */
  affinity: number[][];
  /** Weight factor per pair (1 without a relation above weight 1). */
  weightFactor: Float64Array[];
  /** Pairs "i-j" (i < j) joined by a repelling relation. */
  repel: Set<string>;
  /** Rescale bounds of the semantic signal. */
  bounds: RescaleBounds | null;
}

/** Purpose: Builds all signals and their combination for one pass. */
export function buildLayoutSignals(
  nodes: ScatterNode[],
  relationEdges: RelationEdge[],
  vocabulary: RelationTermDef[] | undefined,
  links: ResolvedLinks | undefined,
  weights: LayoutWeights,
  fixedBounds?: RescaleBounds | null
): LayoutSignals {
  const n = nodes.length;
  const semantic = semanticSignal(nodes, fixedBounds);
  const link = linkSignal(nodes, links);
  const relation = relationSignal(nodes, relationEdges, vocabulary);
  const affinity: number[][] = nodes.map(() => new Array<number>(n).fill(0));
  const weightFactor = nodes.map(() => new Float64Array(n).fill(1));
  for (let i = 0; i < n; i++) {
    affinity[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const a = combineAffinity(semantic.matrix[i][j], link[i][j], relation.weight[i][j], weights);
      affinity[i][j] = a;
      affinity[j][i] = a;
      const wf = relationWeightFactor(relation.weight[i][j], weights);
      weightFactor[i][j] = wf;
      weightFactor[j][i] = wf;
    }
  }
  return { affinity, weightFactor, repel: relation.repel, bounds: semantic.bounds };
}
