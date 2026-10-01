import type { MemVectorSettings } from "../../../settings/types";
import type { RelationTermDef } from "../../../relationVocabulary/types";
import { isPlaced, type RelationEdge, type ScatterNode } from "../types";
import { applyVectorLayout, prepareLayoutModel, type LayoutModel } from "./applyVectorLayout";
import { captureLayoutSnapshot, diffLayoutSnapshots, isLayoutUnchanged, type LayoutDiff, type LayoutSnapshot } from "./layoutInputs";
import { LARGE_CHANGE_RATIO, SIMILAR_NEIGHBORS_MOBILE } from "./layoutTunables";
import { applyGraphVectorProjection } from "./projections";

/**
 * "auto": data updates - nothing moves unless a layout input changed, and then only the affected area.
 * "global": a free pass over all nodes from their current positions (e.g. the spacing sliders).
 * "rearrange": a free layout from scratch, ignoring current positions (the explicit rearrange action).
 */
export type LayoutMode = "auto" | "global" | "rearrange";

export interface LayoutRunInput {
  nodes: ScatterNode[];
  relationEdges: RelationEdge[];
  vocabulary?: RelationTermDef[];
  settings: MemVectorSettings;
  nodeSpacing: number;
  cloudSpacing: number;
}

export type LayoutRunKind = "none" | "bounded" | "free";

export interface LayoutRunResult {
  /** True when the force simulation ran and positions may have changed. */
  simulated: boolean;
  kind: LayoutRunKind;
}

/**
 * Purpose: Decides per layout request how much has to be computed, and keeps the state that makes this possible: the
 * signatures of the last completed pass, its similarity rescale bounds and its cluster assignment.
 * Architecture: Positions are the reference (ADR-0006).
 * - Unchanged layout inputs: nothing moves; the kept clusters are re-applied to the (possibly new) node objects.
 * - First request after opening with every node placed: signatures and clusters are initialized without moving.
 * - Local changes (changed, added or re-linked notes): a bounded adjustment moves only those notes, their relation
 *   neighbors and their most similar notes, with the rescale bounds and clusters of the last free pass kept fixed.
 * - Settings changes, a change touching more than LARGE_CHANGE_RATIO of the nodes, a removed cluster centroid, or an
 *   explicit "global"/"rearrange" request: a free pass that also recomputes bounds and clusters.
 */
export class LayoutEngine {
  private snapshot: LayoutSnapshot | null = null;
  private model: Pick<LayoutModel, "bounds" | "centroidIds"> | null = null;
  private clusterOf = new Map<string, number>();

  run(input: LayoutRunInput, mode: LayoutMode = "auto"): LayoutRunResult {
    const { nodes } = input;
    const next = captureLayoutSnapshot(nodes, input.relationEdges, input.vocabulary, {
      nodeSpacing: input.nodeSpacing,
      cloudSpacing: input.cloudSpacing,
      knowledgeDomain: input.settings.knowledgeDomain,
      includeWikiLinksAsRelations: input.settings.includeWikiLinksAsRelations,
    });

    if (mode === "auto") {
      if (this.snapshot === null) {
        if (nodes.every(isPlaced)) {
          this.remember(nodes, prepareLayoutModel(nodes, input.settings), next);
          return { simulated: false, kind: "none" };
        }
      } else {
        const diff = diffLayoutSnapshots(this.snapshot, next);
        if (isLayoutUnchanged(diff)) {
          this.applyClusters(nodes);
          return { simulated: false, kind: "none" };
        }
        if (this.runBounded(input, diff)) {
          this.snapshot = next;
          this.rememberClusters(nodes);
          return { simulated: true, kind: "bounded" };
        }
      }
    }

    if (mode === "rearrange") {
      for (const n of nodes) {
        n.x = 0;
        n.y = 0;
        n.placed = false;
      }
    }
    const model = applyVectorLayout(nodes, input.settings, input.nodeSpacing, input.cloudSpacing, input.relationEdges, input.vocabulary);
    this.remember(nodes, model, next);
    return { simulated: nodes.length > 0, kind: "free" };
  }

  /**
   * Purpose: Runs a bounded adjustment for a local change; returns false when the change is too large for one.
   */
  private runBounded(input: LayoutRunInput, diff: LayoutDiff): boolean {
    const { nodes } = input;
    const model = this.model;
    if (diff.settingsChanged || !model || !model.bounds) return false;
    const indexOf = new Map(nodes.map((n, i) => [n.id, i]));
    const centroidIdx = model.centroidIds.map((id) => indexOf.get(id));
    if (centroidIdx.some((i) => i === undefined)) return false;

    const seeds = new Set<string>([...diff.addedIds, ...diff.changedIds, ...diff.edgeEndpointIds]);
    if (seeds.size > LARGE_CHANGE_RATIO * nodes.length) return false;

    const prepared = prepareLayoutModel(nodes, input.settings, { fixedBounds: model.bounds, assignClusters: false });
    // Neighbors may make every node of a small vault mobile; that is still a low-energy, anchored adjustment.
    const mobileIds = this.mobileSet(nodes, seeds, prepared.matrix, input);

    // Keep every existing cluster; only new or changed notes join the nearest kept centroid.
    this.applyClusters(nodes);
    nodes.forEach((n, i) => {
      if (n.cloudId !== undefined && !seeds.has(n.id)) return;
      let best = 0;
      let bestSim = -Infinity;
      centroidIdx.forEach((c, cloudId) => {
        const sim = prepared.matrix[i][c as number];
        if (sim > bestSim) {
          bestSim = sim;
          best = cloudId;
        }
      });
      n.cloudId = best;
      n.cloudLabel = nodes[centroidIdx[best] as number]?.title || `Cluster ${best + 1}`;
    });

    applyGraphVectorProjection({
      nodes,
      matrix: prepared.matrix,
      nodeSpacing: input.nodeSpacing || input.settings.scatterNodeSpacing || 350,
      cloudSpacing: input.cloudSpacing || input.settings.scatterCloudSpacing || 800,
      relationEdges: input.relationEdges,
      includeWikiLinksAsRelations: input.settings.includeWikiLinksAsRelations,
      vocabulary: input.vocabulary,
      bounded: { mobileIds },
    });
    return true;
  }

  /**
   * Purpose: The notes a bounded adjustment may move: the changed notes, their relation (and, when enabled, WikiLink)
   * neighbors, and their SIMILAR_NEIGHBORS_MOBILE most similar notes.
   */
  private mobileSet(nodes: ScatterNode[], seeds: Set<string>, matrix: number[][], input: LayoutRunInput): Set<string> {
    const mobile = new Set(seeds);
    const byLower = new Map(nodes.map((n) => [n.id.toLowerCase(), n.id]));
    for (const e of input.relationEdges) {
      const src = byLower.get(e.srcId.toLowerCase());
      const tgt = byLower.get(e.tgtId.toLowerCase());
      if (!src || !tgt) continue;
      if (seeds.has(src)) mobile.add(tgt);
      if (seeds.has(tgt)) mobile.add(src);
    }
    nodes.forEach((seed, i) => {
      if (!seeds.has(seed.id)) return;
      if (input.settings.includeWikiLinksAsRelations) {
        for (const other of nodes) {
          if (other.links?.includes(seed.basenameKey) || seed.links?.includes(other.basenameKey)) mobile.add(other.id);
        }
      }
      const row = matrix[i];
      nodes
        .map((n, j) => ({ id: n.id, sim: j === i ? -Infinity : row[j] }))
        .sort((a, b) => b.sim - a.sim)
        .slice(0, SIMILAR_NEIGHBORS_MOBILE)
        .forEach((m) => mobile.add(m.id));
    });
    return mobile;
  }

  private remember(nodes: ScatterNode[], model: Pick<LayoutModel, "bounds" | "centroidIds">, snapshot: LayoutSnapshot): void {
    this.snapshot = snapshot;
    this.model = { bounds: model.bounds, centroidIds: model.centroidIds };
    this.rememberClusters(nodes);
  }

  private rememberClusters(nodes: ScatterNode[]): void {
    this.clusterOf = new Map();
    for (const n of nodes) if (n.cloudId !== undefined) this.clusterOf.set(n.id, n.cloudId);
  }

  /** Re-applies the kept cluster assignment, so freshly scanned node objects keep their cluster and label. */
  private applyClusters(nodes: ScatterNode[]): void {
    const centroidIds = this.model?.centroidIds ?? [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const n of nodes) {
      const cloudId = this.clusterOf.get(n.id);
      if (cloudId === undefined) {
        n.cloudId = undefined;
        continue;
      }
      n.cloudId = cloudId;
      n.cloudLabel = byId.get(centroidIds[cloudId])?.title || `Cluster ${cloudId + 1}`;
    }
  }
}
