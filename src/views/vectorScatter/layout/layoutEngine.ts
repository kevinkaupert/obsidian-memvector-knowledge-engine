import type { MemVectorSettings } from "../../../settings/types";
import type { RelationTermDef } from "../../../relationVocabulary/types";
import { isPlaced, type RelationEdge, type ScatterNode } from "../types";
import { applyVectorLayout, copyNodesInPathOrder, prepareLayoutModel, type LayoutModel } from "./applyVectorLayout";
import { captureLayoutSnapshot, diffLayoutSnapshots, isLayoutUnchanged, type LayoutDiff, type LayoutSnapshot } from "./layoutInputs";
import { LARGE_CHANGE_RATIO, NEIGHBOR_MOVE_LIMIT, SETTLE_MAX_PASSES, SETTLE_PAIR_BUDGET, SETTLE_STOP_RATIO, SIMILAR_NEIGHBORS_MOBILE } from "./layoutTunables";
import { applyGraphVectorProjection } from "./projections";

/**
 * "auto": data updates - nothing moves unless a layout input changed, and then only the affected area.
 * "global": a free pass over all nodes from their current positions (e.g. the spacing sliders).
 * "rearrange": a free layout from scratch, ignoring current positions (the explicit rearrange action).
 * "relations": a relation change from the relation builder - like "auto", but never a free pass because of the size
 *   of the change (Plan 0005 S1).
 */
export type LayoutMode = "auto" | "global" | "rearrange" | "relations";

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
  /** True when positions may have changed, by a simulation or by scaling to a new node spacing (Plan 0005 S4). */
  moved: boolean;
  kind: LayoutRunKind;
  /** Extra passes of a layout built from scratch and whether they stopped below the movement threshold. */
  settle?: { passes: number; converged: boolean };
}

/**
 * Purpose: Decides per layout request how much has to be computed, and keeps the state that makes this possible: the
 * signatures of the last completed pass, its similarity rescale bounds and its cluster assignment.
 * Architecture: Positions are the reference (ADR-0006).
 * - Unchanged layout inputs: nothing moves; the kept clusters are re-applied to the (possibly new) node objects.
 * - First request after opening with every node placed: signatures and clusters are initialized without moving. If
 *   only some notes lack a stored position, the others initialize the state and the new ones are placed by a bounded
 *   adjustment.
 * - Local changes (changed, added or re-linked notes): a bounded adjustment moves only those notes, their relation
 *   neighbors and their most similar notes, with the rescale bounds and clusters of the last free pass kept fixed. If
 *   a cluster centroid disappeared (e.g. filtered out), only the cluster assignment is recomputed - a display change.
 * - Settings changes, a change touching more than LARGE_CHANGE_RATIO of the nodes, or an explicit "global" /
 *   "rearrange" request: a free pass that also recomputes bounds and clusters.
 */
export class LayoutEngine {
  private snapshot: LayoutSnapshot | null = null;
  private model: Pick<LayoutModel, "bounds" | "centroidIds"> | null = null;
  private clusterOf = new Map<string, number>();
  /** Node spacing the current positions were laid out with; a new value scales them (Plan 0005 S4). */
  private appliedNodeSpacing: number | undefined;
  /** Cloud spacing the passes use; a new value is applied at the next rearrange only (Plan 0005 S5). */
  private appliedCloudSpacing: number | undefined;

  run(input: LayoutRunInput, mode: LayoutMode = "auto"): LayoutRunResult {
    input = { ...input, nodes: copyNodesInPathOrder(input.nodes) };
    const scaled = this.applySpacing(input, mode);
    input = { ...input, nodeSpacing: this.appliedNodeSpacing ?? input.nodeSpacing, cloudSpacing: this.appliedCloudSpacing ?? input.cloudSpacing };
    const result = this.runLayout(input, mode);
    return { ...result, moved: result.moved || scaled };
  }

  /**
   * Purpose: Applies the spacing values before a pass. A rearrange or the first run takes both values as given. Later,
   * a new node spacing scales every placed position by new / old around the origin (no simulation, bounds and
   * clusters kept), and a new cloud spacing is only remembered until the next rearrange. Returns whether positions
   * were scaled.
   */
  private applySpacing(input: LayoutRunInput, mode: LayoutMode): boolean {
    if (mode === "rearrange" || this.appliedNodeSpacing === undefined || this.appliedCloudSpacing === undefined) {
      this.appliedNodeSpacing = input.nodeSpacing;
      this.appliedCloudSpacing = input.cloudSpacing;
      return false;
    }
    if (input.nodeSpacing === this.appliedNodeSpacing || !(input.nodeSpacing > 0) || !(this.appliedNodeSpacing > 0)) return false;
    const ratio = input.nodeSpacing / this.appliedNodeSpacing;
    this.appliedNodeSpacing = input.nodeSpacing;
    let any = false;
    for (const n of input.nodes) {
      if (!isPlaced(n)) continue;
      n.x *= ratio;
      n.y *= ratio;
      any = true;
    }
    return any;
  }

  private runLayout(input: LayoutRunInput, mode: LayoutMode): LayoutRunResult {
    const { nodes } = input;
    const next = captureLayoutSnapshot(nodes, input.relationEdges, input.vocabulary, {
      nodeSpacing: input.nodeSpacing,
      cloudSpacing: input.cloudSpacing,
      knowledgeDomain: input.settings.knowledgeDomain,
      includeWikiLinksAsRelations: input.settings.includeWikiLinksAsRelations,
    });

    if (mode === "auto" || mode === "relations") {
      if (this.snapshot === null) {
        const unplaced = nodes.filter((n) => !isPlaced(n)).map((n) => n.id);
        if (unplaced.length === 0) {
          this.remember(nodes, prepareLayoutModel(nodes, input.settings), next);
          return { simulated: false, moved: false, kind: "none" };
        }
        if (unplaced.length < nodes.length) {
          this.model = prepareLayoutModel(nodes, input.settings);
          this.rememberClusters(nodes);
          const added: LayoutDiff = { settingsChanged: false, addedIds: new Set(unplaced), removedIds: new Set(), changedIds: new Set(), edgeEndpointIds: new Set() };
          if (this.runBounded(input, added, mode === "relations")) {
            this.snapshot = next;
            this.rememberClusters(nodes);
            return { simulated: true, moved: true, kind: "bounded" };
          }
        }
      } else {
        const diff = diffLayoutSnapshots(this.snapshot, next);
        if (isLayoutUnchanged(diff)) {
          this.applyClusters(nodes);
          return { simulated: false, moved: false, kind: "none" };
        }
        if (this.runBounded(input, diff, mode === "relations")) {
          this.snapshot = next;
          this.rememberClusters(nodes);
          return { simulated: true, moved: true, kind: "bounded" };
        }
      }
    }

    const fromScratch = mode === "rearrange" || nodes.every((n) => !isPlaced(n));
    if (mode === "rearrange") {
      for (const n of nodes) {
        n.x = 0;
        n.y = 0;
        n.placed = false;
      }
    }
    const model = applyVectorLayout(nodes, input.settings, input.nodeSpacing, input.cloudSpacing, input.relationEdges, input.vocabulary);
    const settle = fromScratch && nodes.length > 0 && model.matrix.length === nodes.length ? this.settle(nodes, model.matrix, input) : undefined;
    this.remember(nodes, model, next);
    return { simulated: nodes.length > 0, moved: nodes.length > 0, kind: "free", ...(settle ? { settle } : {}) };
  }

  /**
   * Purpose: Lets a layout built from scratch settle with further free passes on the same matrix and node order.
   * Architecture: Bounded best effort: at most SETTLE_MAX_PASSES and SETTLE_PAIR_BUDGET / n^2 passes, stopping once the
   * largest move of a pass is below SETTLE_STOP_RATIO of node spacing. Deterministic; no wall clock.
   */
  private settle(nodes: ScatterNode[], matrix: number[][], input: LayoutRunInput): { passes: number; converged: boolean } {
    const maxPasses = Math.min(SETTLE_MAX_PASSES, Math.floor(SETTLE_PAIR_BUDGET / (nodes.length * nodes.length)));
    const nodeSpacing = input.nodeSpacing || input.settings.scatterNodeSpacing || 350;
    const stopAt = SETTLE_STOP_RATIO * nodeSpacing;
    for (let passes = 1; passes <= maxPasses; passes++) {
      const before = nodes.map((n) => ({ x: n.x, y: n.y }));
      applyGraphVectorProjection({
        nodes,
        matrix,
        nodeSpacing,
        cloudSpacing: input.cloudSpacing || input.settings.scatterCloudSpacing || 800,
        relationEdges: input.relationEdges,
        includeWikiLinksAsRelations: input.settings.includeWikiLinksAsRelations,
        vocabulary: input.vocabulary,
      });
      let largest = 0;
      nodes.forEach((n, i) => {
        largest = Math.max(largest, Math.hypot(n.x - before[i].x, n.y - before[i].y));
      });
      if (largest < stopAt) return { passes, converged: true };
    }
    return { passes: maxPasses, converged: false };
  }

  /**
   * Purpose: Runs a bounded adjustment for a local change; returns false when the change is too large for one.
   */
  private runBounded(input: LayoutRunInput, diff: LayoutDiff, ignoreSize = false): boolean {
    const { nodes } = input;
    const model = this.model;
    if (diff.settingsChanged || !model || !model.bounds) return false;
    const seeds = new Set<string>([...diff.addedIds, ...diff.changedIds, ...diff.edgeEndpointIds]);
    if (!ignoreSize && seeds.size > LARGE_CHANGE_RATIO * nodes.length) return false;

    const indexOf = new Map(nodes.map((n, i) => [n.id, i]));
    const centroidMissing = model.centroidIds.some((id) => !indexOf.has(id));
    const prepared = prepareLayoutModel(nodes, input.settings, { fixedBounds: model.bounds, assignClusters: centroidMissing });
    // Neighbors may make every node of a small vault mobile; that is still a low-energy, anchored adjustment.
    const mobileIds = this.mobileSet(nodes, seeds, prepared.matrix, input);

    if (centroidMissing) {
      // A centroid left the node set: re-cluster for display, positions are unaffected.
      this.model = { bounds: model.bounds, centroidIds: prepared.centroidIds };
    } else {
      // Keep every existing cluster; only new or changed notes join the nearest kept centroid.
      const centroidIdx = model.centroidIds.map((id) => indexOf.get(id) as number);
      this.applyClusters(nodes);
      nodes.forEach((n, i) => {
        if (n.cloudId !== undefined && !seeds.has(n.id)) return;
        let best = 0;
        let bestSim = -Infinity;
        centroidIdx.forEach((c, cloudId) => {
          const sim = prepared.matrix[i][c];
          if (sim > bestSim) {
            bestSim = sim;
            best = cloudId;
          }
        });
        n.cloudId = best;
        n.cloudLabel = nodes[centroidIdx[best]]?.title || `Cluster ${best + 1}`;
      });
    }

    const before = new Map(nodes.filter((n) => mobileIds.has(n.id) && !seeds.has(n.id)).map((n) => [n.id, { x: n.x, y: n.y }]));
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
    // Hard bound (Plan 0005 S3): a note that only moved along ends at most NEIGHBOR_MOVE_LIMIT x node spacing away.
    const limit = NEIGHBOR_MOVE_LIMIT * (input.nodeSpacing || input.settings.scatterNodeSpacing || 350);
    for (const n of nodes) {
      const start = before.get(n.id);
      if (!start) continue;
      const dx = n.x - start.x;
      const dy = n.y - start.y;
      const distance = Math.hypot(dx, dy);
      if (distance > limit) {
        n.x = start.x + (dx / distance) * limit;
        n.y = start.y + (dy / distance) * limit;
      }
    }
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
        .sort((a, b) => (b.sim - a.sim) || a.id.localeCompare(b.id, "en"))
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
