import type { App } from "obsidian";
import { fetchEmbedding } from "../llm/fetchEmbedding";
import { resolveEmbeddingApiKey } from "../settings/secrets";
import type { MemVectorSettings } from "../settings/types";
import { listIndexableFiles } from "../vaultFilter";
import { pathToId } from "../noteSlug";
import { buildEmbeddingInput } from "./embeddingText";
import { EmbeddingTargetChangedError, embeddingTargetChanged, resolveEmbeddingTarget } from "./embeddingTarget";
import type { VectorPoint, VectorStore } from "./vectorStore";

export interface VectorSyncResult {
  totalFiles: number;
  syncedCount: number;
  skippedCount: number;
}

/**
 * Purpose: Synchronizes vault markdown embeddings to the VectorStore incrementally and reconciles removed files.
 * The store must be scoped to the same embedding target (getVectorStore(app, settings)); its stored hashes then only
 * cover vectors of the configured model and endpoint, so a model switch re-embeds unchanged notes.
 * Architecture: The run is bound to the target it started with. If the model or endpoint changes while it runs, it
 * throws EmbeddingTargetChangedError before writing anything, so it cannot overwrite vectors of the new model.
 */
export async function syncVaultVectors(app: App, settings: MemVectorSettings, store: VectorStore): Promise<VectorSyncResult> {
  const totalFiles = app.vault.getMarkdownFiles().length;
  const indexableFiles = listIndexableFiles(app, settings.vectorSearchExclusions);
  const embeddingApiKey = resolveEmbeddingApiKey(app, settings);
  const target = resolveEmbeddingTarget(settings);

  const points: VectorPoint[] = [];
  // Every currently-included file, regardless of whether its embedding attempt
  // below succeeds this run - reconciliation must not delete a file's existing
  // stored vector just because a single transient embedding call for it failed.
  const includedPaths: string[] = [];
  let consecutiveErrors = 0;
  let firstErrorMsg: string | null = null;
  let skippedCount = 0;

  const storedHashes = await store.getStoredHashes();

  const assertTargetUnchanged = () => {
    if (embeddingTargetChanged(settings, target.fingerprint)) throw new EmbeddingTargetChangedError(target.fingerprint);
  };

  for (const file of indexableFiles) {
    assertTargetUnchanged();
    includedPaths.push(file.path);
    const rawContent = await app.vault.cachedRead(file);
    if (!rawContent.trim()) continue;
    const { text: sampleText, hash: currentHash, body: content } = buildEmbeddingInput(file.basename, rawContent, settings.embeddingMaxChars);

    const cached = storedHashes.get(file.path) ?? storedHashes.get(pathToId(file.path));
    if (cached && cached.hash === currentHash) {
      skippedCount++;
      continue;
    }

    const { embedding, error } = await fetchEmbedding(sampleText, target.apiBase, embeddingApiKey, target.model);

    if (error) {
      consecutiveErrors++;
      if (!firstErrorMsg) firstErrorMsg = error;
      if (consecutiveErrors >= 3 || (points.length === 0 && consecutiveErrors >= 1)) {
        throw new Error(`Embedding error (${target.model}): ${firstErrorMsg}`);
      }
      continue;
    }

    consecutiveErrors = 0;

    if (embedding && embedding.length > 0) {
      points.push({
        id: pathToId(file.path),
        vector: embedding,
        payload: { path: file.path, title: file.basename, content: content.slice(0, 500) },
        contentHash: currentHash,
        mtime: file.stat?.mtime,
      });
    }
  }

  assertTargetUnchanged();
  if (points.length > 0) {
    await store.syncPoints(points);
  }
  await store.reconcile(includedPaths);
  // Also covers runs where every note was a cache hit: their hashes may stem from an earlier failed write.
  await store.flush();

  return { totalFiles, syncedCount: points.length, skippedCount };
}

