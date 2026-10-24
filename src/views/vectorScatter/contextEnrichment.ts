import { TFile, type App } from "obsidian";
import { getGraphStore, getVectorStore } from "../../sync/storeFactory";
import type { MemVectorSettings } from "../../settings/types";
import { noteKey } from "../../noteKey";
import type { ScatterNode } from "./types";
import { shouldIncludeFile } from "./vaultScan";
import type { TranslationKeys } from "../../i18n";
import type { GraphStore } from "../../sync/graphStore";
import type { VectorStore } from "../../sync/vectorStore";
import { assembleHybridContext, type ContextSource, type EnrichedContext } from "../../context/hybridContext";

export { assembleContextNotes, type EnrichedContext, type EnrichedNote } from "../../context/hybridContext";

export function contextWarnings(context: EnrichedContext, t: TranslationKeys): string[] {
  const warnings: string[] = [];
  if (context.channels.vector === "error") warnings.push(t.retrievalVectorFailed);
  if (context.channels.vector === "unindexed") warnings.push(t.retrievalVectorUnindexed);
  if (context.channels.graph === "error") warnings.push(t.retrievalGraphFailed);
  if (context.channels.graph === "unindexed") warnings.push(t.retrievalGraphUnindexed);
  return warnings;
}

/**
 * Purpose: The plugin's ContextSource: MemVector's stores and the vault API (the shared assembly is in
 * context/hybridContext.ts, also used by `cli.js context`).
 * Architecture: Each store is created on first use inside its channel, so a store that cannot be opened fails only
 * that channel, as before the move.
 */
function obsidianContextSource(app: App, settings: MemVectorSettings): ContextSource {
  let vectors: VectorStore | undefined;
  let graph: GraphStore | undefined;
  const vectorStore = () => (vectors ??= getVectorStore(app, settings));
  const graphStore = () => (graph ??= getGraphStore(app, settings));
  return {
    storedVectors: (paths) => vectorStore().getVectors(paths),
    searchVectors: (vector, limit) => vectorStore().search(vector, limit),
    graphIndexed: async () => {
      const store = graphStore();
      return typeof store.isIndexed === "function" ? store.isIndexed() : true;
    },
    neighbors: (ids, hops) => graphStore().fetchNeighbors(ids, hops, 0, 0),
    note: (path) => {
      const file = app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) return null;
      return { included: shouldIncludeFile(file, settings.vectorSearchExclusions) };
    },
    read: async (path) => {
      const file = app.vault.getAbstractFileByPath(path);
      // note() said the file exists; it can only be gone if it was deleted in between
      if (!(file instanceof TFile)) throw new Error(`${path} was removed while the context was assembled`);
      return app.vault.cachedRead(file);
    },
    keyOf: (path) => noteKey(app, path),
  };
}

/**
 * Purpose: Orchestrates hybrid GraphRAG context enrichment across semantic vector search and graph topology.
 * Architecture: All context caps come from settings (vectorNeighborLimit, hopLevelNeighborLimit, totalContextLimit) with 0 = unlimited - no hidden model-tier budget (Issue #103). Manually dismissed note ids (excludeIds, Issue #116) are filtered out of the final result so preview and synthesis payload stay identical.
 */
export async function enrichContext(
  app: App,
  settings: MemVectorSettings,
  selected: ScatterNode[],
  excerptLength = 200,
  hopDepth = settings.synthesisHopDepth ?? 2,
  excludeIds?: ReadonlySet<string>
): Promise<EnrichedContext> {
  return assembleHybridContext(obsidianContextSource(app, settings), settings, selected, excerptLength, hopDepth, excludeIds);
}
