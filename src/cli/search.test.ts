import { readFileSync } from "fs";
import { resolve } from "path";
import type { App } from "obsidian";
import { afterEach, describe, expect, it } from "vitest";
import { closeLocalDb, flushLocalDb, localDbPath } from "../sync/sqlite/sqliteDb";
import { SqliteVectorStore } from "../sync/sqlite/sqliteVectorStore";
import { resolveEmbeddingTarget } from "../sync/embeddingTarget";
import type { EmbeddingPost } from "../llm/embeddingRequest";
import { searchIndex } from "./search";

const WASM = readFileSync(resolve(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm"));
const SETTINGS = { embeddingModel: "bge-m3", embeddingApiBaseUrl: "http://localhost:11434/v1" };

/** Builds a real index file with the plugin's own store, so the CLI reads exactly what the plugin writes. */
async function indexBytes(points: Array<[string, number[]]>, settings = SETTINGS): Promise<Uint8Array> {
  const files = new Map<string, ArrayBuffer>();
  const app = {
    vault: {
      configDir: ".obsidian",
      adapter: {
        exists: async (p: string) => files.has(p),
        readBinary: async (p: string) => files.get(p)!,
        writeBinary: async (p: string, d: ArrayBuffer) => { files.set(p, d); },
        mkdir: async () => {},
      },
    },
  } as unknown as App;
  const store = new SqliteVectorStore(app, resolveEmbeddingTarget(settings).fingerprint);
  await store.syncPoints(points.map(([id, vector]) => ({ id, vector, payload: { path: `wiki/${id}.md`, title: id, content: "" } })));
  await flushLocalDb(app);
  return new Uint8Array(files.get(localDbPath(app))!);
}

function answering(vector: number[] | null, calls: string[] = []): EmbeddingPost {
  return async (req) => {
    calls.push(req.url);
    return vector ? { status: 200, json: { data: [{ embedding: vector }] } } : { status: 500, json: undefined };
  };
}

afterEach(async () => {
  await closeLocalDb();
});

describe("memvector search (CLI, #289)", () => {
  it("ranks the indexed notes by cosine similarity to the query embedding", async () => {
    const db = await indexBytes([["Kommutativität", [1, 0, 0]], ["Matrix", [0, 1, 0]], ["Gegenteil", [-1, 0, 0]]]);
    const calls: string[] = [];
    const result = await searchIndex({ settings: SETTINGS, db, wasm: WASM }, "kommutativ", 2, answering([0.9, 0.1, 0], calls));
    expect(result.outcome).toBe("ok");
    if (result.outcome !== "ok") return;
    expect(result.results.map((r) => r.path)).toEqual(["wiki/Kommutativität.md", "wiki/Matrix.md"]);
    expect(result.results[0].score).toBeGreaterThan(0.9);
    expect(result).toMatchObject({ model: "bge-m3", indexed: 3, fingerprint: "bge-m3@http://localhost:11434/v1" });
    expect(calls).toEqual(["http://localhost:11434/v1/embeddings"]);
  });

  it("ignores vectors of another embedding model and reports an index without this model as an error", async () => {
    const db = await indexBytes([["Basis", [1, 0]]], { ...SETTINGS, embeddingModel: "other-model" });
    const result = await searchIndex({ settings: SETTINGS, db, wasm: WASM }, "Basis", 5, answering([1, 0]));
    expect(result).toMatchObject({ outcome: "error", code: "INDEX_EMPTY" });
  });

  it("reports an unreachable embedding model instead of results", async () => {
    const db = await indexBytes([["Basis", [1, 0]]]);
    const result = await searchIndex({ settings: SETTINGS, db, wasm: WASM }, "Basis", 5, answering(null));
    expect(result).toMatchObject({ outcome: "error", code: "EMBEDDING_FAILED" });
  });

  it("refuses a query embedding whose size differs from the index", async () => {
    const db = await indexBytes([["Basis", [1, 0]]]);
    const result = await searchIndex({ settings: SETTINGS, db, wasm: WASM }, "Basis", 5, answering([1, 0, 0]));
    expect(result).toMatchObject({ outcome: "error", code: "DIMENSION_MISMATCH" });
  });

  it("reports a file that is not an index", async () => {
    const result = await searchIndex({ settings: SETTINGS, db: new TextEncoder().encode("kein sqlite"), wasm: WASM }, "x", 5, answering([1]));
    expect(result).toMatchObject({ outcome: "error", code: "INDEX_UNREADABLE" });
  });
});
