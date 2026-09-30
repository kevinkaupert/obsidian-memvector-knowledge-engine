import type { App } from "obsidian";
import { fetchEmbedding } from "../llm/fetchEmbedding";
import { resolveEmbeddingApiKey } from "../settings/secrets";
import type { MemVectorSettings } from "../settings/types";
import { shouldIncludeFile } from "../vaultFilter";
import { pathToId } from "../noteSlug";
import { buildEmbeddingInput } from "./embeddingText";
import type { VectorPoint, VectorStore } from "./vectorStore";

export interface VectorSyncResult {
  totalFiles: number;
  syncedCount: number;
  skippedCount: number;
}

/**
 * Purpose: Synchronizes vault markdown embeddings to the VectorStore incrementally and reconciles removed files.
 */
export async function syncVaultVectors(app: App, settings: MemVectorSettings, store: VectorStore): Promise<VectorSyncResult> {
  const vaultFiles = app.vault.getMarkdownFiles();
  const embeddingApiKey = resolveEmbeddingApiKey(app, settings);

  const points: VectorPoint[] = [];
  // Every currently-included file, regardless of whether its embedding attempt
  // below succeeds this run - reconciliation must not delete a file's existing
  // stored vector just because a single transient embedding call for it failed.
  const includedPaths: string[] = [];
  let consecutiveErrors = 0;
  let firstErrorMsg: string | null = null;
  let skippedCount = 0;

  const storedHashes = await store.getStoredHashes();

  for (let i = 0; i < vaultFiles.length; i++) {
    const file = vaultFiles[i];
    if (!shouldIncludeFile(file, settings.vectorSearchExclusions)) continue;
    includedPaths.push(file.path);
    const rawContent = await app.vault.cachedRead(file);
    if (!rawContent.trim()) continue;
    const { text: sampleText, hash: currentHash, body: content } = buildEmbeddingInput(file.basename, rawContent, settings.embeddingMaxChars);

    const cached = storedHashes.get(file.path) ?? storedHashes.get(pathToId(file.path));
    if (cached && cached.hash === currentHash) {
      skippedCount++;
      continue;
    }

    const { embedding, error } = await fetchEmbedding(sampleText, settings.embeddingApiBaseUrl, embeddingApiKey, settings.embeddingModel);

    if (error) {
      consecutiveErrors++;
      if (!firstErrorMsg) firstErrorMsg = error;
      if (consecutiveErrors >= 3 || (points.length === 0 && consecutiveErrors >= 1)) {
        throw new Error(`Embedding error (${settings.embeddingModel}): ${firstErrorMsg}`);
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

  if (points.length > 0) {
    await store.syncPoints(points);
  }
  await store.reconcile(includedPaths);

  return { totalFiles: vaultFiles.length, syncedCount: points.length, skippedCount };
}

