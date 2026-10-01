import type { RelationTermDef } from "../../../relationVocabulary/types";
import { DEFAULT_RELATION_VOCABULARY } from "../../../relationVocabulary/defaultVocabulary";
import { bundledLayoutForLabel } from "../../../relationVocabulary/layoutDefaults";
import type { RelationEdge, ScatterNode } from "../types";

const DEFAULT_RELATION_WEIGHT = 1.0;
const WIKILINK_WEIGHT = 0.7;
export const BASELINE_WEIGHT = 0.05;
const MAX_HOPS = 4;
/** Decayed attraction for notes that are close in the graph but not directly connected. Kept below spring attraction threshold (0.15) to prevent multi-hop cluster collapse. */
const HOP_DECAY: Record<number, number> = { 2: 0.12, 3: 0.08, 4: 0.05 };

export interface GraphTopologyWeights {
  /** n x n attraction weight matrix; BASELINE_WEIGHT for anything unreached within MAX_HOPS. */
  conn: Float64Array[];
  /** "i-j" (i<j, node array indices) pairs with a direct repelling edge (repels: true in the vocabulary) - push apart instead of attract. */
  repel: Set<string>;
}

export type RelationForce = { repels: true } | { repels: false; weight: number };

/**
 * Purpose: Indexes a relation vocabulary by upper-cased label; the first definition per label wins.
 * Architecture: Matches the Settings type table, which also collapses synonym entries to one row per canonical label.
 */
export function buildLabelIndex(vocabulary: RelationTermDef[] = DEFAULT_RELATION_VOCABULARY): Map<string, RelationTermDef> {
  const labelIndex = new Map<string, RelationTermDef>();
  for (const def of vocabulary) {
    const labelKey = def.label.toUpperCase();
    if (!labelIndex.has(labelKey)) labelIndex.set(labelKey, def);
  }
  return labelIndex;
}

/**
 * Purpose: Resolves the layout force a relation type exerts: repulsion, or attraction with a weight.
 * Architecture: A label the active vocabulary does not define at all (e.g. an older CONFLICTS_WITH edge after switching
 * to the Law preset) keeps its bundled layout semantics rather than silently degrading to generic attraction. Shared by
 * the simulation and the layout-input signatures, so both see the same force.
 */
export function resolveRelationForce(relType: string, labelIndex: Map<string, RelationTermDef>): RelationForce {
  const def = labelIndex.get(relType.toUpperCase()) ?? bundledLayoutForLabel(relType);
  if (def?.repels) return { repels: true };
  return { repels: false, weight: def?.weight ?? DEFAULT_RELATION_WEIGHT };
}

/**
 * Purpose: Builds an undirected graph from typed relation edges and, when opted in, WikiLinks, then computes BFS hop-distance attraction and repulsion weights.
 * Architecture: Feeds dynamic topology forces into organic 2D force simulation (Issue #41). WikiLink attraction is opt-in via includeWikiLinksAsRelations (default false) so topology follows explicit typed relations only unless enabled (Issue #100, ADR-0001). Per-label attraction/repulsion comes from the loaded relation vocabulary (weight/repels, ADR-0002) - no hardcoded type maps remain. Labels the active vocabulary does not define fall back to the bundled layout semantics for that canonical label (layoutDefaults.ts) instead of the generic default weight.
 */
export function computeGraphTopologyWeights(
  nodes: ScatterNode[],
  relationEdges: RelationEdge[],
  includeWikiLinksAsRelations = false,
  vocabulary: RelationTermDef[] = DEFAULT_RELATION_VOCABULARY
): GraphTopologyWeights {
  const n = nodes.length;
  const idToIndex = new Map(nodes.map((node, i) => [node.id.toLowerCase(), i]));
  const adjacency: Map<number, number>[] = nodes.map(() => new Map<number, number>());
  const repel = new Set<string>();

  const labelIndex = buildLabelIndex(vocabulary);

  const addEdge = (i: number, j: number, weight: number): void => {
    adjacency[i].set(j, Math.max(adjacency[i].get(j) ?? 0, weight));
    adjacency[j].set(i, Math.max(adjacency[j].get(i) ?? 0, weight));
  };

  if (includeWikiLinksAsRelations) {
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j];
        // WikiLinks target basenames, not the canonical (path-based) id - match on basenameKey.
        const isLinked = (a.links && a.links.includes(b.basenameKey)) || (b.links && b.links.includes(a.basenameKey));
        if (isLinked) addEdge(i, j, WIKILINK_WEIGHT);
      }
    }
  }

  relationEdges.forEach((e) => {
    const i = idToIndex.get(e.srcId.toLowerCase());
    const j = idToIndex.get(e.tgtId.toLowerCase());
    if (i === undefined || j === undefined || i === j) return;
    const force = resolveRelationForce(e.relType, labelIndex);
    if (force.repels) {
      repel.add(`${Math.min(i, j)}-${Math.max(i, j)}`);
    } else {
      addEdge(i, j, force.weight);
    }
  });

  const conn: Float64Array[] = nodes.map(() => new Float64Array(n).fill(BASELINE_WEIGHT));
  for (let start = 0; start < n; start++) {
    const dist = new Int8Array(n).fill(-1);
    dist[start] = 0;
    let frontier = [start];
    for (let hop = 1; hop <= MAX_HOPS && frontier.length > 0; hop++) {
      const next: number[] = [];
      for (const node of frontier) {
        adjacency[node].forEach((_weight, neighbor) => {
          if (dist[neighbor] === -1) {
            dist[neighbor] = hop;
            next.push(neighbor);
          }
        });
      }
      frontier = next;
    }
    for (let j = 0; j < n; j++) {
      if (j === start || dist[j] === -1) continue;
      conn[start][j] = dist[j] === 1 ? adjacency[start].get(j)! : (HOP_DECAY[dist[j]] ?? BASELINE_WEIGHT);
    }
  }

  return { conn, repel };
}
