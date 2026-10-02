import type { RelationTermDef } from "../../../relationVocabulary/types";
import type { RelationEdge, ScatterNode } from "../types";
import { buildLabelIndex, resolveRelationForce } from "./graphTopologyWeights";
import { prepareNodeTokens } from "./similarity";

/** Settings that change the layout of every node at once. */
export interface LayoutSettingsInputs {
  nodeSpacing: number;
  cloudSpacing: number;
  /** "math" compares formulas instead of words (see calcSimilarity). */
  knowledgeDomain: string;
  includeWikiLinksAsRelations: boolean;
}

/**
 * Signatures of everything the layout reads, taken after a completed pass. Comparing two snapshots tells whether a
 * pass would compute anything new.
 */
export interface LayoutSnapshot {
  /** Node id -> signature of its own layout inputs. */
  nodes: Map<string, string>;
  /** Unordered endpoint pair -> effective force of the relation edges between them. */
  edges: Map<string, string>;
  settings: string;
}

export interface LayoutDiff {
  settingsChanged: boolean;
  addedIds: Set<string>;
  removedIds: Set<string>;
  /** Nodes present in both snapshots whose own inputs changed. */
  changedIds: Set<string>;
  /** Endpoints of relation edges that were added, removed or changed their force. */
  edgeEndpointIds: Set<string>;
}

/** FNV-1a over the vector, rounded to 1e-6, so equal vectors give equal signatures without storing them. */
function hashVector(vector: number[] | undefined): string {
  if (!vector || vector.length === 0) return "none";
  let h = 0x811c9dc5;
  for (const v of vector) {
    h ^= Math.round(v * 1e6) | 0;
    h = Math.imul(h, 0x01000193);
  }
  return `${vector.length}:${(h >>> 0).toString(36)}`;
}

const sortedJoin = (values: Iterable<string>): string => [...new Set(values)].sort().join("\u0001");

/**
 * Purpose: Signature of one note's own layout inputs.
 * Architecture: Built from the prepared inputs the similarity and topology code actually reads - identity and the
 * basename WikiLinks match on, folder, link targets and the active semantic features (formulas in the math domain,
 * otherwise the words of the excerpt), and the vector. Title and type only label the node and are left out, so editing
 * them is a display change. A hash of the whole Markdown content would also change on edits the layout never sees.
 */
export function nodeLayoutSignature(node: ScatterNode, isMath: boolean): string {
  const tokens = prepareNodeTokens(node);
  const semantic = isMath ? tokens.formulas : tokens.words;
  return [node.id, node.basenameKey, tokens.folder, sortedJoin(node.links ?? []), sortedJoin(semantic), hashVector(node.embedding)].join("\u0002");
}

const pairKey = (a: string, b: string): string => (a < b ? `${a}\u0003${b}` : `${b}\u0003${a}`);

/**
 * Purpose: Effective layout force per endpoint pair, for relation edges whose endpoints are both laid out.
 * Architecture: The topology is undirected and keyed by endpoints, so direction and description do not count; only
 * whether the pair repels and the strongest attraction weight, resolved exactly as the simulation does.
 */
export function edgeForceSignatures(nodes: ScatterNode[], relationEdges: RelationEdge[], vocabulary?: RelationTermDef[]): Map<string, string> {
  const ids = new Set(nodes.map((n) => n.id.toLowerCase()));
  const labelIndex = buildLabelIndex(vocabulary);
  const byPair = new Map<string, { repels: boolean; weight: number }>();
  for (const e of relationEdges) {
    const src = e.srcId.toLowerCase();
    const tgt = e.tgtId.toLowerCase();
    if (src === tgt || !ids.has(src) || !ids.has(tgt)) continue;
    const key = pairKey(src, tgt);
    const force = resolveRelationForce(e.relType, labelIndex);
    const entry = byPair.get(key) ?? { repels: false, weight: 0 };
    if (force.repels) entry.repels = true;
    else entry.weight = Math.max(entry.weight, force.weight);
    byPair.set(key, entry);
  }
  const out = new Map<string, string>();
  byPair.forEach((f, key) => out.set(key, `${f.repels ? "R" : "A"}:${f.weight}`));
  return out;
}

/**
 * Purpose: Captures the signatures of all layout inputs for the given nodes, edges, vocabulary and settings.
 */
export function captureLayoutSnapshot(
  nodes: ScatterNode[],
  relationEdges: RelationEdge[],
  vocabulary: RelationTermDef[] | undefined,
  settings: LayoutSettingsInputs
): LayoutSnapshot {
  const isMath = settings.knowledgeDomain === "math";
  const nodeSigs = new Map<string, string>();
  for (const n of nodes) nodeSigs.set(n.id, nodeLayoutSignature(n, isMath));
  return {
    nodes: nodeSigs,
    edges: edgeForceSignatures(nodes, relationEdges, vocabulary),
    settings: [settings.nodeSpacing, settings.cloudSpacing, isMath ? "math" : "text", settings.includeWikiLinksAsRelations ? "wl" : "-"].join("|"),
  };
}

/**
 * Purpose: Lists what changed between two snapshots.
 */
export function diffLayoutSnapshots(prev: LayoutSnapshot, next: LayoutSnapshot): LayoutDiff {
  const addedIds = new Set<string>();
  const removedIds = new Set<string>();
  const changedIds = new Set<string>();
  next.nodes.forEach((sig, id) => {
    const before = prev.nodes.get(id);
    if (before === undefined) addedIds.add(id);
    else if (before !== sig) changedIds.add(id);
  });
  prev.nodes.forEach((_sig, id) => {
    if (!next.nodes.has(id)) removedIds.add(id);
  });

  // Edge keys use lower-cased ids; map them back to the node ids of the snapshot that contains them.
  const byLower = new Map<string, string>();
  for (const id of prev.nodes.keys()) byLower.set(id.toLowerCase(), id);
  for (const id of next.nodes.keys()) byLower.set(id.toLowerCase(), id);
  const edgeEndpointIds = new Set<string>();
  const addEndpoints = (key: string) => {
    for (const part of key.split("\u0003")) {
      const id = byLower.get(part);
      if (id !== undefined) edgeEndpointIds.add(id);
    }
  };
  next.edges.forEach((sig, key) => {
    if (prev.edges.get(key) !== sig) addEndpoints(key);
  });
  prev.edges.forEach((_sig, key) => {
    if (!next.edges.has(key)) addEndpoints(key);
  });

  return { settingsChanged: prev.settings !== next.settings, addedIds, removedIds, changedIds, edgeEndpointIds };
}

/** True when nothing the layout reads changed. */
export function isLayoutUnchanged(diff: LayoutDiff): boolean {
  return !diff.settingsChanged && diff.addedIds.size === 0 && diff.removedIds.size === 0 && diff.changedIds.size === 0 && diff.edgeEndpointIds.size === 0;
}
