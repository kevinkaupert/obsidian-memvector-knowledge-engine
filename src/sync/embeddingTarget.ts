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
 * fingerprint. The base URL is normalized (case, trailing slashes, an explicit
 * `/embeddings` suffix fetchEmbedding would add anyway) so equivalent spellings do not
 * force a full re-embed.
 */
export function resolveEmbeddingTarget(settings: Pick<MemVectorSettings, "embeddingModel" | "embeddingApiBaseUrl">): EmbeddingTarget {
  const model = (settings.embeddingModel || DEFAULT_SETTINGS.embeddingModel).trim();
  const apiBase = (settings.embeddingApiBaseUrl || DEFAULT_SETTINGS.embeddingApiBaseUrl).trim();
  const normalizedBase = apiBase
    .toLowerCase()
    .replace(/\/+$/, "")
    .replace(/\/embeddings$/, "");
  return { model, apiBase, fingerprint: `${model}@${normalizedBase}` };
}
