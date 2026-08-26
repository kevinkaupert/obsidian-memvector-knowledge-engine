import type { App } from "obsidian";
import { fetchEmbedding } from "../../llm/fetchEmbedding";
import { getEmbeddingApiKey, getQdrantApiKey } from "../../settings/secrets";
import type { MemVectorSettings } from "../../settings/types";
import { ensureCollection, upsertPoints, type QdrantPoint } from "./qdrantClient";
import { pointIdForPath } from "./pointId";
import { stripFrontmatter } from "../../noteContent";

export interface QdrantSyncResult {
  totalFiles: number;
  syncedCount: number;
}

/**
 * Bugfix (found while extracting this from main.js:1483-1563): the original
 * handler checked `embedding.length > 0` and pushed `vector: embedding`
 * directly, but `fetchEmbedding()` resolves an `{ embedding, error }` object,
 * not a bare array. `.length` on that object is always `undefined`, so the
 * condition was always false — the Qdrant sync button never synced a single
 * note, it just always reported "no embeddings generated" regardless of
 * whether the embedding call actually succeeded.
 */
export async function syncVaultToQdrant(app: App, settings: MemVectorSettings): Promise<QdrantSyncResult> {
  const vaultFiles = app.vault.getMarkdownFiles();
  const baseUrl = (settings.qdrantUrl || "http://localhost:6333").replace(/\/+$/, "");
  const collection = settings.qdrantCollection || "obsidian_wiki_vectors";
  const qdrantApiKey = getQdrantApiKey(app);
  const embeddingApiKey = getEmbeddingApiKey(app);

  await ensureCollection(baseUrl, collection, qdrantApiKey);

  const points: QdrantPoint[] = [];
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
        id: pointIdForPath(file.path),
        vector: embedding,
        payload: { path: file.path, title: file.basename, content: content.slice(0, 500) },
      });
    }
  }

  if (points.length > 0) {
    await upsertPoints(baseUrl, collection, qdrantApiKey, points);
  }

  return { totalFiles: vaultFiles.length, syncedCount: points.length };
}
