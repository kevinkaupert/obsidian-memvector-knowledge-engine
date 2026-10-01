import { DEFAULT_SETTINGS } from "../settings/defaults";
import type { MemVectorSettings } from "../settings/types";

export interface EmbeddingTarget {
  /** Model name sent to the provider. */
  model: string;
  /** API base URL sent to the provider. */
  apiBase: string;
  /** Identity of the vector space the model/endpoint pair produces - stored per vector row. */
  fingerprint: string;
}

/**
 * Purpose: Resolves the embedding model and endpoint every indexing path must call, plus the
 * fingerprint that identifies the vector space they produce.
 * Architecture: A stored vector is only valid for the fingerprint it was computed under.
 * Vectors from different models (or different servers serving a same-named model) live in
 * incompatible spaces, so the cache check, search and hydration all compare against this
 * fingerprint. The base URL is normalized (scheme/host case, trailing slashes, an explicit
 * `/embeddings` suffix fetchEmbedding would add anyway) so equivalent spellings do not
 * force a full re-embed.
 */
export function resolveEmbeddingTarget(settings: Pick<MemVectorSettings, "embeddingModel" | "embeddingApiBaseUrl">): EmbeddingTarget {
  const model = (settings.embeddingModel || DEFAULT_SETTINGS.embeddingModel).trim();
  const apiBase = (settings.embeddingApiBaseUrl || DEFAULT_SETTINGS.embeddingApiBaseUrl).trim();
  return { model, apiBase, fingerprint: `${model}@${normalizeBaseUrl(apiBase)}` };
}

/**
 * Purpose: Tells whether the configured embedding target no longer matches the fingerprint an indexing run started with.
 * Architecture: Indexing runs await one request per note while Settings stay editable, so a run re-checks this before
 * handing out or storing vectors - results computed under the old fingerprint belong to the previous vector space.
 */
export function embeddingTargetChanged(settings: Pick<MemVectorSettings, "embeddingModel" | "embeddingApiBaseUrl">, fingerprint: string): boolean {
  return resolveEmbeddingTarget(settings).fingerprint !== fingerprint;
}

/**
 * Purpose: Signals that an indexing run was cancelled because the embedding model or endpoint changed while it ran.
 */
export class EmbeddingTargetChangedError extends Error {
  constructor(readonly previousFingerprint: string) {
    super(`Embedding model or endpoint changed during indexing (was ${previousFingerprint}); the run's vectors were discarded`);
    this.name = "EmbeddingTargetChangedError";
  }
}

/**
 * Purpose: Normalizes an API base URL for fingerprint comparison.
 * Architecture: Only scheme and host are case-insensitive (URL parsing lowercases them); the path keeps its case,
 * since a server may route `/ModelA/v1` and `/modela/v1` differently. Trailing slashes and an explicit `/embeddings`
 * suffix are dropped because fetchEmbedding treats those spellings as the same endpoint. An unparseable value is
 * compared as typed.
 */
function normalizeBaseUrl(apiBase: string): string {
  let base = apiBase;
  try {
    const url = new URL(apiBase);
    base = `${url.protocol}//${url.host}${url.pathname}${url.search}`;
  } catch {
    // Not an absolute URL - fetchEmbedding will fail on it anyway; keep it distinguishable.
  }
  return base.replace(/\/+$/, "").replace(/\/embeddings$/, "");
}
