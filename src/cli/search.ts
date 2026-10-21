import initSqlJs from "sql.js";
import { cosineSimilarity } from "../sync/sqlite/cosineSimilarity";
import { resolveEmbeddingTarget } from "../sync/embeddingTarget";
import type { EmbeddingPost } from "../llm/embeddingRequest";
import { requestEmbedding } from "../llm/embeddingRequest";

/** Plugin id under `<configDir>/plugins/`, where Obsidian keeps MemVector's settings and index. */
export const PLUGIN_ID = "memvector-knowledge-engine";
export const DB_FILENAME = "memvector-local.sqlite";

export interface SearchHit {
  path: string;
  title: string;
  score: number;
}

export type SearchResult =
  | { outcome: "ok"; query: string; model: string; fingerprint: string; indexed: number; results: SearchHit[] }
  | { outcome: "error"; code: string; error: string };

/** What the search needs from the plugin folder: settings (`data.json`), the index, and the sql.js engine. */
export interface SearchSource {
  settings: { embeddingModel?: string; embeddingApiBaseUrl?: string };
  db: Uint8Array;
  wasm: Uint8Array;
}

/**
 * Purpose: Semantic search over MemVector's index without Obsidian (memvector#289, knowOS ADR-0010): embeds the query
 * with the configured embedding model and ranks the indexed notes of that model by cosine similarity.
 * Architecture: Reads the index from bytes and never writes it; only rows with the current embedding fingerprint are
 * compared (the same scope as the plugin's SqliteVectorStore), so vectors of another model never give wrong scores.
 * An index without rows for this fingerprint is an error, not an empty result.
 */
export async function searchIndex(
  source: SearchSource,
  query: string,
  limit: number,
  post: EmbeddingPost,
  apiKey = ""
): Promise<SearchResult> {
  const target = resolveEmbeddingTarget({
    embeddingModel: source.settings.embeddingModel ?? "",
    embeddingApiBaseUrl: source.settings.embeddingApiBaseUrl ?? "",
  });
  const SQL = await initSqlJs({ wasmBinary: source.wasm.buffer.slice(source.wasm.byteOffset, source.wasm.byteOffset + source.wasm.byteLength) as ArrayBuffer });
  const db = new SQL.Database(source.db);
  let rows: Array<{ path: string; title: string; vector: number[] }>;
  try {
    const result = db.exec("SELECT path, title, vector FROM vectors WHERE embedding_fingerprint = ? ORDER BY path ASC", [target.fingerprint]);
    rows = result.length === 0 ? [] : result[0].values.map((r) => ({
      path: String(r[0]),
      title: String(r[1]),
      vector: JSON.parse(String(r[2])) as number[],
    }));
  } catch (err) {
    return { outcome: "error", code: "INDEX_UNREADABLE", error: `The index cannot be read: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    db.close();
  }
  if (rows.length === 0) {
    return {
      outcome: "error",
      code: "INDEX_EMPTY",
      error: `The index has no notes embedded with ${target.fingerprint}; open the vault in Obsidian and let MemVector index it.`,
    };
  }

  const embedded = await requestEmbedding(post, query, target.apiBase, apiKey, target.model);
  if (!embedded.embedding) {
    return { outcome: "error", code: "EMBEDDING_FAILED", error: embedded.error ?? "Embedding failed." };
  }
  const dims = rows[0].vector.length;
  if (embedded.embedding.length !== dims) {
    return {
      outcome: "error",
      code: "DIMENSION_MISMATCH",
      error: `The query embedding has ${embedded.embedding.length} dimensions, the index ${dims}; the model at ${target.apiBase} is not the one that built the index.`,
    };
  }
  const query_vector = embedded.embedding;
  const results = rows
    .map((r) => ({ path: r.path, title: r.title, score: cosineSimilarity(query_vector, r.vector) }))
    .sort((a, b) => (b.score - a.score) || a.path.localeCompare(b.path, "en"))
    .slice(0, Math.max(1, Math.trunc(limit)));
  return { outcome: "ok", query, model: target.model, fingerprint: target.fingerprint, indexed: rows.length, results };
}
