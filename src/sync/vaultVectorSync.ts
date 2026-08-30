import type { App } from "obsidian";
import { fetchEmbedding } from "../llm/fetchEmbedding";
import { stripFrontmatter } from "../noteContent";
import { getEmbeddingApiKey } from "../settings/secrets";
import type { MemVectorSettings } from "../settings/types";
import type { VectorPoint, VectorStore } from "./vectorStore";

export interface VectorSyncResult {
  totalFiles: number;
  syncedCount: number;
}

/**
 * Bugfix (found while extracting this from main.js:1483-1563): the original
 * handler checked `embedding.length > 0` and pushed `vector: embedding`
 * directly, but `fetchEmbedding()` resolves an `{ embedding, error }` object,
 * not a bare array. `.length` on that object is always `undefined`, so the
 * sync button never synced a single note, it just always reported "no
 * embeddings generated" regardless of whether the embedding call actually
 * succeeded.
 *
 * Backend-agnostic: scans + embeds the vault once, then hands the points to
 * whichever VectorStore (Qdrant or local SQLite) is currently configured.
 */
export async function syncVaultVectors(app: App, settings: MemVectorSettings, store: VectorStore): Promise<VectorSyncResult> {
  const vaultFiles = app.vault.getMarkdownFiles();
  const embeddingApiKey = getEmbeddingApiKey(app);

  const points: VectorPoint[] = [];
  for (const file of vaultFiles) {
    const rawContent = await app.vault.read(file);
    if (!rawContent.trim()) continue;
    // Bugfix: a note with a long frontmatter block (big `sources:`/`tags:`
    // list) could have its entire embedding computed from YAML noise
    // instead of actual content - strip it before truncating.
    const content = stripFrontmatter(rawContent);

    const { embedding } = await fetchEmbedding(content.slice(0, 1000), settings.embeddingApiBaseUrl, embeddingApiKey, settings.embeddingModel);

    if (embedding && embedding.length > 0) {
      points.push({
        id: file.path,
        vector: embedding,
        payload: { path: file.path, title: file.basename, content: content.slice(0, 500) },
      });
    }
  }

  if (points.length > 0) {
    await store.syncPoints(points);
  }

  return { totalFiles: vaultFiles.length, syncedCount: points.length };
}
