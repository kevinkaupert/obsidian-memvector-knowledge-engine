import type { App } from "obsidian";
import type { MemVectorSettings } from "../settings/types";
import { listIndexableFiles } from "../vaultFilter";
import { runVectorPipeline } from "./vectorPipeline";
import type { VectorStore } from "./vectorStore";

export interface VectorSyncResult {
  totalFiles: number;
  syncedCount: number;
  skippedCount: number;
  failedCount: number;
  failedPaths: string[];
}

/**
 * Purpose: Synchronizes the embeddings of every indexable vault note to the VectorStore and reconciles removed files.
 * Architecture: Runs the shared vector pipeline (vectorPipeline.ts) over the whole indexable vault, so it gives the
 * same error tolerance, persistence and reconcile guarantees as the 2D view's "Calculate vectors". Throws
 * EmbeddingTargetChangedError, EmbeddingAbortedError or VectorPersistenceError from the pipeline.
 */
export async function syncVaultVectors(app: App, settings: MemVectorSettings, store: VectorStore): Promise<VectorSyncResult> {
  const totalFiles = app.vault.getMarkdownFiles().length;
  const paths = listIndexableFiles(app, settings.vectorSearchExclusions).map((f) => f.path);
  const result = await runVectorPipeline(app, settings, store, { paths, reconcilePaths: paths });
  return {
    totalFiles,
    syncedCount: result.calculatedCount,
    skippedCount: result.skippedCount,
    failedCount: result.failedPaths.length,
    failedPaths: result.failedPaths,
  };
}
