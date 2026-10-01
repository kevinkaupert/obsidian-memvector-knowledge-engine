import type { MemVectorSettings } from "../../../settings/types";
import type { RelationTermDef } from "../../../relationVocabulary/types";
import { isPlaced, type RelationEdge, type ScatterNode } from "../types";
import { applyVectorLayout, prepareLayoutModel, type LayoutModel } from "./applyVectorLayout";
import { captureLayoutSnapshot, diffLayoutSnapshots, isLayoutUnchanged, type LayoutSnapshot } from "./layoutInputs";

/**
 * "auto": data updates - nothing is computed unless a layout input changed.
 * "global": an explicit global pass from the current positions (e.g. the spacing sliders).
 */
export type LayoutMode = "auto" | "global";

export interface LayoutRunInput {
  nodes: ScatterNode[];
  relationEdges: RelationEdge[];
  vocabulary?: RelationTermDef[];
  settings: MemVectorSettings;
  nodeSpacing: number;
  cloudSpacing: number;
}

export interface LayoutRunResult {
  /** True when the force simulation ran and positions may have changed. */
  simulated: boolean;
}

/**
 * Purpose: Decides per layout request whether anything has to be computed, and keeps the state that makes this
 * decision possible: the signatures of the last completed pass and its cluster assignment.
 * Architecture: Positions are the reference (ADR-0006). A request whose layout inputs match the last pass leaves every
 * node where it is and only re-applies the cluster assignment to the (possibly new) node objects. The first request
 * after opening the view has nothing to compare against; if every node already has a position it initializes the
 * signatures and clusters without moving anything.
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
          return { simulated: false };
        }
      } else if (isLayoutUnchanged(diffLayoutSnapshots(this.snapshot, next))) {
        this.applyClusters(nodes);
        return { simulated: false };
      }
    }

    const model = applyVectorLayout(nodes, input.settings, input.nodeSpacing, input.cloudSpacing, input.relationEdges, input.vocabulary);
    this.remember(nodes, model, next);
    return { simulated: nodes.length > 0 };
  }

  private remember(nodes: ScatterNode[], model: Pick<LayoutModel, "bounds" | "centroidIds">, snapshot: LayoutSnapshot): void {
    this.snapshot = snapshot;
    this.model = { bounds: model.bounds, centroidIds: model.centroidIds };
    this.clusterOf = new Map();
    for (const n of nodes) if (n.cloudId !== undefined) this.clusterOf.set(n.id, n.cloudId);
  }

  /** Re-applies the kept cluster assignment, so freshly scanned node objects keep their cluster and label. */
  private applyClusters(nodes: ScatterNode[]): void {
    const centroidIds = this.model?.centroidIds ?? [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const n of nodes) {
      const cloudId = this.clusterOf.get(n.id);
      if (cloudId === undefined) continue;
      n.cloudId = cloudId;
      n.cloudLabel = byId.get(centroidIds[cloudId])?.title || `Cluster ${cloudId + 1}`;
    }
  }
}
