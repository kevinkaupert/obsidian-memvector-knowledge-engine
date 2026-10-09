import { TFile, type App } from "obsidian";
import { fetchEmbedding } from "../llm/fetchEmbedding";
import { resolveEmbeddingApiKey } from "../settings/secrets";
import type { MemVectorSettings } from "../settings/types";
import { pathToId } from "../noteSlug";
import { buildEmbeddingInput } from "./embeddingText";
import { EmbeddingTargetChangedError, embeddingTargetChanged, resolveEmbeddingTarget } from "./embeddingTarget";
import type { StoredVectorHash, VectorPoint, VectorStore } from "./vectorStore";

/** Consecutive failed embedding requests after which a run gives up instead of skipping the note. */
const MAX_CONSECUTIVE_EMBEDDING_ERRORS = 3;

export interface VectorPipelineOptions {
  /** Notes to embed, in this order. Paths whose file no longer exists are counted as vanished. */
  paths: string[];
  /** The complete indexable vault. Stored vectors of paths not in this list are removed after the run. */
  reconcilePaths: string[];
  /** Also return the vectors of cache hits (read from the store); needed by callers that hand vectors to a view. */
  collectVectors?: boolean;
  /** Called before each embedding request (not for cache hits). `index` is 0-based. */
  onProgress?: (index: number, total: number, path: string) => void;
  /** Called for every failed embedding request, also for the one that aborts the run. */
  onEmbeddingError?: (index: number, total: number, path: string, error: string) => void;
}

export interface VectorPipelineResult {
  /** Number of requested paths. */
  total: number;
  /** Requested paths whose file was gone when the run reached it. */
  vanishedCount: number;
  /** Notes embedded and written in this run. */
  calculatedCount: number;
  /** Notes whose stored vector matched their current text. */
  skippedCount: number;
  /** Notes whose embedding request failed; their previous stored vector is kept. */
  failedPaths: string[];
  /** Vectors per path (fresh and, with collectVectors, cached). */
  vectors: Map<string, number[]>;
  /** The model the run embedded with. */
  model: string;
}

/** Thrown when the run gave up on repeated embedding errors. The vectors calculated before are already written. */
export class EmbeddingAbortedError extends Error {
  constructor(message: string, readonly partial: VectorPipelineResult) {
    super(message);
    this.name = "EmbeddingAbortedError";
  }
}

/** Thrown when writing, reconciling or flushing the vector store failed. Carries the run's calculated vectors. */
export class VectorPersistenceError extends Error {
  constructor(readonly cause: unknown, readonly partial: VectorPipelineResult) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "VectorPersistenceError";
  }
}

/**
 * Purpose: Embeds notes, writes the new vectors and reconciles the store - the one pipeline behind "Index vault
 * locally now" and the 2D view's "Calculate vectors".
 * Architecture: The store must be scoped to the configured embedding target (getVectorStore(app, settings)), so its
 * hashes only cover vectors of that model and endpoint. A failed note is skipped and recorded; the run aborts after
 * MAX_CONSECUTIVE_EMBEDDING_ERRORS in a row, or when the very first request fails (wrong endpoint or model), and then
 * still writes what it calculated but does not reconcile. Reconcile runs against `reconcilePaths`, which include
 * failed notes, so their previous vectors survive. A change of the embedding target mid-run throws
 * EmbeddingTargetChangedError before anything is written, so the run never writes vectors of the previous model.
 */
export async function runVectorPipeline(app: App, settings: MemVectorSettings, store: VectorStore, options: VectorPipelineOptions): Promise<VectorPipelineResult> {
  const target = resolveEmbeddingTarget(settings);
  const apiKey = resolveEmbeddingApiKey(app, settings);
  const { paths, reconcilePaths, collectVectors = false, onProgress, onEmbeddingError } = options;
  const assertTargetUnchanged = () => {
    if (embeddingTargetChanged(settings, target.fingerprint)) throw new EmbeddingTargetChangedError(target.fingerprint);
  };

  const storedHashes = await readOrWarn(() => store.getStoredHashes(), new Map<string, StoredVectorHash>(), "stored vector hashes");
  const storedVectors = collectVectors
    ? await readOrWarn(() => store.getVectors(paths), new Map<string, number[]>(), "stored vectors")
    : new Map<string, number[]>();

  const result: VectorPipelineResult = {
    total: paths.length, vanishedCount: 0, calculatedCount: 0, skippedCount: 0, failedPaths: [], vectors: new Map(), model: target.model,
  };
  const points: VectorPoint[] = [];
  let consecutiveErrors = 0;
  let abortMessage: string | null = null;

  for (let i = 0; i < paths.length; i++) {
    assertTargetUnchanged();
    const path = paths[i];
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      result.vanishedCount++;
      continue;
    }
    const { text, hash, body } = buildEmbeddingInput(file.basename, await app.vault.cachedRead(file), settings.embeddingMaxChars);

    const cached = storedHashes.get(path) ?? storedHashes.get(pathToId(path));
    if (cached && cached.hash === hash) {
      // With collectVectors a cache hit counts only when the vector itself can be handed back; otherwise re-embed.
      const stored = storedVectors.get(path);
      if (!collectVectors || (stored && stored.length > 0)) {
        if (stored) result.vectors.set(path, stored);
        result.skippedCount++;
        continue;
      }
    }

    onProgress?.(i, paths.length, path);
    const { embedding, error } = await fetchEmbedding(text, target.apiBase, apiKey, target.model);
    if (error || !embedding || embedding.length === 0) {
      const message = error || "empty embedding";
      result.failedPaths.push(path);
      onEmbeddingError?.(i, paths.length, path, message);
      consecutiveErrors++;
      // A failing first request usually means a wrong endpoint or model, so the run stops instead of hitting every note.
      const firstRequest = result.calculatedCount === 0 && consecutiveErrors === 1;
      if (consecutiveErrors >= MAX_CONSECUTIVE_EMBEDDING_ERRORS || firstRequest) {
        abortMessage = `Embedding error (${target.model}): ${message}`;
        break;
      }
      continue;
    }
    consecutiveErrors = 0;
    result.vectors.set(path, embedding);
    result.calculatedCount++;
    points.push({
      id: pathToId(path),
      vector: embedding,
      payload: { path, title: file.basename, content: body.slice(0, 500) },
      contentHash: hash,
      mtime: file.stat?.mtime,
    });
  }

  assertTargetUnchanged();
  try {
    if (points.length > 0) await store.syncPoints(points);
    if (abortMessage === null) await store.reconcile(reconcilePaths);
    // Also covers runs where every note was a cache hit: their hashes may stem from an earlier failed write.
    await store.flush();
  } catch (err) {
    throw new VectorPersistenceError(err, result);
  }

  if (abortMessage !== null) throw new EmbeddingAbortedError(abortMessage, result);
  return result;
}

/** Reads cache data from the store; a failure only costs the cache, so it is logged and the run continues. */
async function readOrWarn<T>(read: () => Promise<T>, fallback: T, what: string): Promise<T> {
  try {
    return await read();
  } catch (err) {
    console.warn(`MemVector: Failed to load ${what}, calculating unconditionally:`, err);
    return fallback;
  }
}
