import type { App } from "obsidian";
import { confirmedEdges } from "../frontmatterLinks";
import { readRelationLabels } from "../relationVocabulary/presets";
import type { MemVectorSettings } from "../settings/types";
import { relationsFolder } from "../vaultLayout";
import { loadRelationEdges } from "../views/vectorScatter/relationEdges";
import type { GraphStore } from "./graphStore";

/** Purpose: Case-insensitive identity of one directed graph edge, matching how graph-store ids are written. */
export function edgeKey(src: string, tgt: string, relType: string): string {
  return JSON.stringify([src.toLowerCase(), tgt.toLowerCase(), relType.toUpperCase()]);
}

/**
 * Purpose: Collects the directed edges the vault still asserts as confirmed, from relation notes and frontmatter
 * typed links, ignoring the relation notes at `ignoredPaths` (the note being deleted or replaced) (#254).
 * Architecture: Ignoring by path is needed because a replaced or just-trashed note can still be in the metadata cache.
 */
export async function loadAssertedEdgeKeys(
  app: App,
  settings: Partial<MemVectorSettings>,
  ignoredPaths: string[] = []
): Promise<Set<string>> {
  const ignored = new Set(ignoredPaths);
  const edges = confirmedEdges(
    await loadRelationEdges(app, settings.vectorSearchExclusions ?? "", relationsFolder(settings), await readRelationLabels(app, settings))
  );
  const keys = new Set<string>();
  for (const e of edges) {
    if (ignored.has(e.path)) continue;
    keys.add(edgeKey(e.srcId, e.tgtId, e.relType));
    if (e.bidirectional) keys.add(edgeKey(e.tgtId, e.srcId, e.relType));
  }
  return keys;
}

/**
 * Purpose: Removes a graph-index edge only when no other relation note or frontmatter link still asserts it (#254).
 * Architecture: If the vault cannot be read, the edge is kept: a stale edge is fixed by the next full re-index, while a
 * wrongly deleted one silently drops knowledge from GraphRAG until then.
 */
export async function deleteEdgeUnlessAsserted(
  store: GraphStore,
  asserted: Set<string> | null,
  src: string,
  tgt: string,
  relType: string
): Promise<void> {
  if (asserted === null || asserted.has(edgeKey(src, tgt, relType))) return;
  await store.deleteEdge(src, tgt, relType);
}
