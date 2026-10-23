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
  /** The paragraph of the note that shares most words with the query, else its first paragraph (knowOS ADR-0014). */
  excerpt: string;
}

/** Filters applied before ranking: a vault-relative folder and a frontmatter `type`. */
export interface SearchFilters {
  folder?: string;
  type?: string;
}

/** Reads a note's text by its vault path; null when it cannot be read (then the index's stored start is used). */
export type ReadNote = (path: string) => string | null;

export const EXCERPT_CHARS = 400;

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
  apiKey = "",
  instruction?: string,
  readNote: ReadNote = () => null,
  filters: SearchFilters = {}
): Promise<SearchResult> {
  const target = resolveEmbeddingTarget({
    embeddingModel: source.settings.embeddingModel ?? "",
    embeddingApiBaseUrl: source.settings.embeddingApiBaseUrl ?? "",
  });
  const SQL = await initSqlJs({ wasmBinary: source.wasm.buffer.slice(source.wasm.byteOffset, source.wasm.byteOffset + source.wasm.byteLength) as ArrayBuffer });
  const db = new SQL.Database(source.db);
  let rows: Array<{ path: string; title: string; vector: number[]; content: string }>;
  try {
    const result = db.exec("SELECT path, title, vector, content FROM vectors WHERE embedding_fingerprint = ? ORDER BY path ASC", [target.fingerprint]);
    rows = result.length === 0 ? [] : result[0].values.map((r) => ({
      path: String(r[0]),
      title: String(r[1]),
      vector: JSON.parse(String(r[2])) as number[],
      content: r[3] === null ? "" : String(r[3]),
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

  const indexed = rows.length;
  const texts = new Map<string, string | null>();
  const textOf = (path: string): string | null => {
    if (!texts.has(path)) texts.set(path, readNote(path));
    return texts.get(path) ?? null;
  };
  if (filters.folder) {
    const prefix = `${filters.folder.replace(/^\/+|\/+$/g, "")}/`;
    rows = rows.filter((r) => r.path.startsWith(prefix));
  }
  if (filters.type) {
    rows = rows.filter((r) => frontmatterType(textOf(r.path)) === filters.type);
  }

  // Instruction-tuned embedding models expect a query in this form; the notes themselves are embedded as they are
  const text = instruction ? `Instruct: ${instruction}\nQuery: ${query}` : query;
  const embedded = await requestEmbedding(post, text, target.apiBase, apiKey, target.model);
  if (!embedded.embedding) {
    return { outcome: "error", code: "EMBEDDING_FAILED", error: embedded.error ?? "Embedding failed." };
  }
  const dims = embedded.embedding.length;
  const mismatched = rows.filter((r) => r.vector.length !== dims);
  if (mismatched.length > 0) {
    return {
      outcome: "error",
      code: "DIMENSION_MISMATCH",
      error: `The query embedding has ${dims} dimensions, ${mismatched.length} indexed note(s) another size (e.g. ${mismatched[0].path}: ${mismatched[0].vector.length}); re-index the vault with the configured model.`,
    };
  }
  const query_vector = embedded.embedding;
  const results = rows
    .map((r) => ({ row: r, score: cosineSimilarity(query_vector, r.vector) }))
    .sort((a, b) => (b.score - a.score) || a.row.path.localeCompare(b.row.path, "en"))
    .slice(0, Math.max(1, Math.trunc(limit)))
    .map(({ row, score }) => ({
      path: row.path,
      title: row.title,
      score,
      excerpt: excerptFor(bodyOf(textOf(row.path)) ?? row.content, query),
    }));
  return { outcome: "ok", query, model: target.model, fingerprint: target.fingerprint, indexed, results };
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** The note text without its frontmatter; null stays null. */
function bodyOf(text: string | null): string | null {
  return text === null ? null : text.replace(FRONTMATTER, "");
}

/** The frontmatter `type` of a note text (plain or quoted scalar), or null. */
export function frontmatterType(text: string | null): string | null {
  const block = text?.match(FRONTMATTER)?.[1];
  const line = block?.split(/\r?\n/).find((l) => /^type\s*:/.test(l));
  if (!line) return null;
  const value = line.replace(/^type\s*:\s*/, "").trim().replace(/^(["'])(.*)\1$/, "$2");
  return value || null;
}

/** Lowercased words of at least four letters, cut to five so that word forms (Ventil, Ventile) meet. */
function stems(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []).map((w) => w.slice(0, 5)));
}

/**
 * Purpose: The passage a model should see for a hit: the note's paragraphs, those sharing most word stems with the
 * query first (ties in note order), joined with " … " up to EXCERPT_CHARS; headings are skipped. A note with one
 * matching sentence in its third paragraph thus shows that sentence even when the first paragraph matches better.
 */
export function excerptFor(body: string, query: string): string {
  const paragraphs = body
    .split(/\r?\n/)
    .map((line) => (/^#{1,6}\s/.test(line) ? "" : line))
    .join("\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p);
  if (paragraphs.length === 0) return "";
  const wanted = stems(query);
  const ranked = paragraphs
    .map((p, index) => ({ p, index, hits: [...stems(p)].filter((s) => wanted.has(s)).length }))
    .sort((a, b) => (b.hits - a.hits) || (a.index - b.index));
  let excerpt = "";
  for (const { p } of ranked) {
    const next = excerpt ? `${excerpt} … ${p}` : p;
    if (next.length > EXCERPT_CHARS) {
      if (!excerpt) excerpt = `${p.slice(0, EXCERPT_CHARS - 1).trimEnd()}…`;
      break;
    }
    excerpt = next;
  }
  return excerpt;
}
