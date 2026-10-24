import { realpathSync, readFileSync, statSync } from "node:fs";
import { basename, posix, relative, resolve, sep } from "node:path";
import initSqlJs from "sql.js";
import { assembleHybridContext, type ContextSource, type EnrichedContext } from "../context/hybridContext";
import type { MemVectorSettings } from "../settings/types";
import { resolveEmbeddingTarget } from "../sync/embeddingTarget";
import { buildNeighborQuery } from "../sync/sqlite/sqliteGraphQueries";
import { cosineSimilarity } from "../sync/sqlite/cosineSimilarity";
import type { VectorSearchHit } from "../sync/vectorStore";
import { pathToId } from "../noteSlug";
import { shouldIncludeFile } from "../vaultFilter";

/**
 * Purpose: `memvector context` (knowOS Plan 0018 step 2): the context the 2D view's synthesis would assemble for the
 * given seed notes - vector neighbors of their centroid and graph neighbors up to the hop depth - without Obsidian, so
 * a chat can answer from the same notes the owner's synthesis uses.
 * Architecture: The assembly is context/hybridContext.ts, shared with the plugin; this file is only its ContextSource
 * over the index bytes (sql.js, read-only, the queries of SqliteVectorStore and SqliteGraphStore) and the vault folder.
 * All caps come from MemVector's settings (the plugin's merge with the defaults); no flag overrides them. Answers with
 * the agent envelope (ADR-0014).
 */

export type ContextResult =
  | { v: 1; outcome: "ok"; data: ContextData }
  | { v: 1; outcome: "error"; error: { code: string; message: string } };

export interface ContextData {
  parameters: Record<string, { value: number; source: "settings" }>;
  index: { model: string; fingerprint: string; indexed: number };
  seeds: Array<{ path: string; title: string }>;
  channels: EnrichedContext["channels"];
  hits: Array<{
    path: string;
    title: string;
    origin: "both" | "vector" | "graph";
    hops: number | null;
    similarity: number | null;
    excerpt: string;
  }>;
  relations: Array<{ from: string; to: string; type: string; description: string }>;
}

type Row = (string | number | Uint8Array | null)[];

function failure(code: string, message: string): ContextResult {
  return { v: 1, outcome: "error", error: { code, message } };
}

/** Resolves a vault-relative path to a file inside the vault after symlinks; null when there is none. */
function vaultFile(root: string, path: string): string | null {
  try {
    const real = realpathSync(resolve(root, path));
    const rel = relative(root, real);
    if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || !statSync(real).isFile()) return null;
    return real;
  } catch {
    return null;
  }
}

export async function contextFor(
  vault: string,
  settings: MemVectorSettings,
  db: Uint8Array,
  wasm: Uint8Array,
  seedPaths: string[]
): Promise<ContextResult> {
  let root: string;
  try {
    root = realpathSync(resolve(vault));
  } catch {
    return failure("VAULT_NOT_FOUND", `The vault ${vault} does not exist.`);
  }
  const SQL = await initSqlJs({ wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer });
  const database = new SQL.Database(db);
  try {
    const rows = (sql: string, params: (string | number)[] = []): Row[] => {
      const result = database.exec(sql, params);
      return result.length === 0 ? [] : result[0].values;
    };
    const target = resolveEmbeddingTarget(settings);
    const scoped = rows("SELECT id, path, title, content, vector FROM vectors WHERE embedding_fingerprint = ? ORDER BY path ASC", [target.fingerprint]);
    const stored = new Map<string, string>(rows("SELECT path, id FROM notes").map((r) => [String(r[0]), String(r[1])]));
    const titles = new Map<string, string>(rows("SELECT path, title FROM notes").map((r) => [String(r[0]), r[1] === null ? "" : String(r[1])]));

    const keyOf = (path: string): string => stored.get(path) ?? pathToId(path);
    const source: ContextSource = {
      storedVectors: async (paths) => {
        // As SqliteVectorStore.getVectors: a row matches by id or by path
        const wanted = new Set(paths);
        const found = new Map<string, number[]>();
        for (const r of scoped) {
          const vector = JSON.parse(String(r[4])) as number[];
          if (wanted.has(String(r[0]))) found.set(String(r[0]), vector);
          if (wanted.has(String(r[1]))) found.set(String(r[1]), vector);
        }
        return found;
      },
      searchVectors: async (vector, limit) => {
        // As SqliteVectorStore.search: cosine, best first, ties by path; limit 0 = all
        const scored: VectorSearchHit[] = scoped.map((r) => ({
          score: cosineSimilarity(vector, JSON.parse(String(r[4])) as number[]),
          payload: { path: String(r[1]), title: String(r[2]), content: String(r[3]) },
        }));
        const sorted = scored.sort((a, b) => (b.score - a.score) || a.payload.path.localeCompare(b.payload.path, "en"));
        return limit > 0 ? sorted.slice(0, Math.trunc(limit)) : sorted;
      },
      graphIndexed: async () => (Number(rows("SELECT COUNT(*) FROM notes")[0]?.[0]) || 0) > 0,
      neighbors: async (ids, hops) => {
        if (ids.length === 0) return [];
        const { sql, params } = buildNeighborQuery(ids, Math.max(1, Math.trunc(hops)), 0, 0);
        return rows(sql, params).map((r) => ({ id: String(r[0]), title: String(r[1]), path: String(r[2]), hops: Number(r[3]) || 1 }));
      },
      note: (path) => {
        if (vaultFile(root, path) === null) return null;
        const name = basename(path);
        return { included: shouldIncludeFile({ path, name, basename: name.replace(/\.md$/, "") }, settings.vectorSearchExclusions) };
      },
      read: async (path) => readFileSync(vaultFile(root, path) ?? resolve(root, path), "utf8"),
      keyOf,
    };

    const seeds: Array<{ id: string; path: string }> = [];
    for (const given of seedPaths) {
      // The index stores vault paths as Obsidian spells them: "./wiki/A.md" and "wiki//A.md" are "wiki/A.md"
      const path = posix.normalize(given.replace(/\\/g, "/")).replace(/^(\.\/)+/, "");
      if (!path.toLowerCase().endsWith(".md") || path.startsWith("../") || vaultFile(root, path) === null) {
        return failure("SEED_NOT_FOUND", `No note ${given} in the vault; name a seed as a vault-relative .md path.`);
      }
      if (!seeds.some((s) => s.path === path)) seeds.push({ id: keyOf(path), path });
    }

    const hopDepth = settings.synthesisHopDepth ?? 2;
    const excerpt = settings.synthesisContentCapChars ?? 0;
    const context = await assembleHybridContext(source, settings, seeds, excerpt, hopDepth);

    const ids = new Set([...seeds.map((s) => s.id), ...context.notes.map((n) => n.id)]);
    const pathOf = new Map<string, string>([...seeds.map((s) => [s.id, s.path] as const), ...context.notes.map((n) => [n.id, n.path] as const)]);
    const relations = rows("SELECT src, tgt, type, description FROM edges ORDER BY src, tgt, type")
      .filter((r) => ids.has(String(r[0])) && ids.has(String(r[1])) && r[0] !== r[1])
      .map((r) => ({ from: pathOf.get(String(r[0]))!, to: pathOf.get(String(r[1]))!, type: String(r[2]), description: r[3] === null ? "" : String(r[3]) }));

    const parameters: ContextData["parameters"] = {};
    for (const key of ["synthesisHopDepth", "hopLevelNeighborLimit", "vectorNeighborLimit", "minVectorSimilarity", "totalContextLimit", "synthesisContentCapChars"] as const) {
      parameters[key] = { value: Number(settings[key] ?? 0), source: "settings" };
    }
    parameters.synthesisHopDepth.value = hopDepth;
    return {
      v: 1,
      outcome: "ok",
      data: {
        parameters,
        index: { model: target.model, fingerprint: target.fingerprint, indexed: scoped.length },
        seeds: seeds.map((s) => ({ path: s.path, title: titles.get(s.path) ?? basename(s.path).replace(/\.md$/, "") })),
        channels: context.channels,
        hits: context.notes.map((n) => ({
          path: n.path,
          title: n.title,
          origin: n.sources.length > 1 ? "both" : n.sources[0],
          hops: n.hops ?? null,
          similarity: n.similarity ?? null,
          excerpt: n.content,
        })),
        relations,
      },
    };
  } catch (err) {
    return failure("INDEX_UNREADABLE", `The index cannot be read: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    database.close();
  }
}
