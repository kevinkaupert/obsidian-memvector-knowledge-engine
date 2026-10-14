import type { App } from "obsidian";
import { buildLinkKeys, confirmedEdges, loadFrontmatterLinkEdges } from "../frontmatterLinks";
import { pathToId } from "../noteSlug";
import { readRelationLabels } from "../relationVocabulary/presets";
import type { MemVectorSettings } from "../settings/types";
import { relationsFolder } from "../vaultLayout";
import { loadRelationFilesResult, resolveLinkTextToId } from "../views/vectorScatter/relationEdges";
import type { GraphStore } from "./graphStore";

/** Purpose: Case-insensitive identity of one directed graph edge, matching how graph-store ids are written. */
export function edgeKey(src: string, tgt: string, relType: string): string {
  return JSON.stringify([src.toLowerCase(), tgt.toLowerCase(), relType.toUpperCase()]);
}

/**
 * Purpose: Collects the directed edges the vault still asserts as confirmed, from relation notes and frontmatter
 * typed links, ignoring the relation notes at `ignoredPaths` (the note being deleted or replaced) (#254).
 * Architecture: Reads every assertion without the display deduplication of loadRelationEdges: there a relation note
 * hides a matching frontmatter link, so dropping an ignored note afterwards would lose the link that still asserts
 * the edge. Ignoring by path is needed because a replaced or just-trashed note can still be in the metadata cache.
 */
export async function loadAssertedEdgeKeys(
  app: App,
  settings: Partial<MemVectorSettings>,
  ignoredPaths: string[] = []
): Promise<Set<string>> {
  const ignored = new Set(ignoredPaths);
  const exclusions = settings.vectorSearchExclusions ?? "";
  const folder = relationsFolder(settings);
  const { edges: relationNoteEdges } = await loadRelationFilesResult(app, exclusions, folder);
  const frontmatterEdges = loadFrontmatterLinkEdges(
    app,
    buildLinkKeys(await readRelationLabels(app, settings)),
    (linkText, sourcePath) => resolveLinkTextToId(app, linkText, sourcePath, exclusions),
    pathToId,
    exclusions,
    folder
  );
  const keys = new Set<string>();
  for (const e of confirmedEdges([...relationNoteEdges, ...frontmatterEdges])) {
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
