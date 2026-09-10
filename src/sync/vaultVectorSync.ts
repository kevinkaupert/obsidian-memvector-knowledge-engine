import type { App } from "obsidian";
import { fetchEmbedding } from "../llm/fetchEmbedding";
import { stripFrontmatter } from "../noteContent";
import { getEmbeddingApiKey } from "../settings/secrets";
import type { MemVectorSettings } from "../settings/types";
import { shouldIncludeFile } from "../views/vectorScatter/vaultScan";
import type { VectorPoint, VectorStore } from "./vectorStore";

export interface VectorSyncResult {
  totalFiles: number;
  syncedCount: number;
}

export async function syncVaultVectors(app: App, settings: MemVectorSettings, store: VectorStore): Promise<VectorSyncResult> {
  const vaultFiles = app.vault.getMarkdownFiles();
  const embeddingApiKey = getEmbeddingApiKey(app);

  const points: VectorPoint[] = [];
  let consecutiveErrors = 0;
  let firstErrorMsg: string | null = null;

  for (let i = 0; i < vaultFiles.length; i++) {
    const file = vaultFiles[i];
    if (!shouldIncludeFile(file, settings.vectorSearchExclusions)) continue;
    const rawContent = await app.vault.cachedRead(file);
    if (!rawContent.trim()) continue;
    const content = stripFrontmatter(rawContent);
    const sampleText = `${file.basename}\n${content}`.slice(0, 1500);

    const { embedding, error } = await fetchEmbedding(sampleText, settings.embeddingApiBaseUrl, embeddingApiKey, settings.embeddingModel);

    if (error) {
      consecutiveErrors++;
      if (!firstErrorMsg) firstErrorMsg = error;
      if (consecutiveErrors >= 3 || (points.length === 0 && consecutiveErrors >= 1)) {
        throw new Error(`Embedding-Fehler (${settings.embeddingModel}): ${firstErrorMsg}`);
      }
      continue;
    }

    consecutiveErrors = 0;

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

