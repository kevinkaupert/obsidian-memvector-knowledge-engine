import { readFileSync } from "fs";
import { resolve } from "path";
import type { App } from "obsidian";
import { afterEach, describe, expect, it } from "vitest";
import { closeLocalDb, flushLocalDb, localDbPath } from "../sync/sqlite/sqliteDb";
import { SqliteVectorStore } from "../sync/sqlite/sqliteVectorStore";
import { resolveEmbeddingTarget } from "../sync/embeddingTarget";
import type { EmbeddingPost } from "../llm/embeddingRequest";
import { excerptFor, frontmatterType, searchIndex } from "./search";

const WASM = readFileSync(resolve(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm"));
const SETTINGS = { embeddingModel: "bge-m3", embeddingApiBaseUrl: "http://localhost:11434/v1" };

/** Builds a real index file with the plugin's own store, so the CLI reads exactly what the plugin writes. */
async function indexBytes(points: Array<[string, number[]]>, settings = SETTINGS, folder = "wiki"): Promise<Uint8Array> {
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
  await store.syncPoints(points.map(([id, vector]) => ({ id, vector, payload: { path: `${folder}/${id}.md`, title: id, content: `Gespeicherter Anfang von ${id}.` } })));
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

  it("refuses an index whose vectors have mixed sizes", async () => {
    const db = await indexBytes([["A", [1, 0]], ["B", [1, 0, 999]]]);
    const result = await searchIndex({ settings: SETTINGS, db, wasm: WASM }, "x", 5, answering([1, 0]));
    expect(result).toMatchObject({ outcome: "error", code: "DIMENSION_MISMATCH" });
  });

  it("sends the query in the instruction form when an instruction is given", async () => {
    const db = await indexBytes([["A", [1, 0]]]);
    const bodies: string[] = [];
    const post: EmbeddingPost = async (req) => { bodies.push(req.body); return { status: 200, json: { data: [{ embedding: [1, 0] }] } }; };
    await searchIndex({ settings: SETTINGS, db, wasm: WASM }, "Gruppe", 5, post, "", "retrieve the defining note");
    expect(JSON.parse(bodies[0]).input).toBe("Instruct: retrieve the defining note\nQuery: Gruppe");
  });

  it("reports a file that is not an index", async () => {
    const result = await searchIndex({ settings: SETTINGS, db: new TextEncoder().encode("kein sqlite"), wasm: WASM }, "x", 5, answering([1]));
    expect(result).toMatchObject({ outcome: "error", code: "INDEX_UNREADABLE" });
  });
});

describe("search hits for agents (knowOS ADR-0014, Plan 0017 step 2)", () => {
  const notes: Record<string, string> = {
    "wiki/Ventile.md": "---\ntype: \"concept\"\n---\n# Ventile\n\nVentile regeln den Durchfluss.\n\nAlle Ventile im Haus sind grün gestrichen, damit man sie findet.\n",
    "wiki/Pumpe.md": "---\ntype: note\n---\nEine Pumpe fördert Wasser.\n",
  };
  const read = (path: string) => notes[path] ?? null;

  it("adds the paragraph that matches the query best as excerpt", async () => {
    const db = await indexBytes([["Ventile", [1, 0]], ["Pumpe", [0, 1]]]);
    const result = await searchIndex({ settings: SETTINGS, db, wasm: WASM }, "Wo finde ich das Ventil am Heizkreis?", 2, answering([1, 0]), "", undefined, read);
    if (result.outcome !== "ok") throw new Error(result.error);
    expect(result.results[0]).toMatchObject({
      path: "wiki/Ventile.md",
      excerpt: "Alle Ventile im Haus sind grün gestrichen, damit man sie findet. … Ventile regeln den Durchfluss.",
    });
    const flow = await searchIndex({ settings: SETTINGS, db, wasm: WASM }, "Durchfluss regeln", 1, answering([1, 0]), "", undefined, read);
    if (flow.outcome !== "ok") throw new Error(flow.error);
    expect(flow.results[0].excerpt).toBe("Ventile regeln den Durchfluss. … Alle Ventile im Haus sind grün gestrichen, damit man sie findet.");
  });

  it("falls back to the index's stored start when the note cannot be read", async () => {
    const db = await indexBytes([["Fehlt", [1, 0]]]);
    const result = await searchIndex({ settings: SETTINGS, db, wasm: WASM }, "x", 1, answering([1, 0]));
    if (result.outcome !== "ok") throw new Error(result.error);
    expect(result.results[0].excerpt).toBe("Gespeicherter Anfang von Fehlt.");
  });

  it("filters by frontmatter type and by folder before ranking", async () => {
    const db = await indexBytes([["Ventile", [1, 0]], ["Pumpe", [0.9, 0.1]]]);
    const typed = await searchIndex({ settings: SETTINGS, db, wasm: WASM }, "x", 5, answering([1, 0]), "", undefined, read, { type: "note" });
    if (typed.outcome !== "ok") throw new Error(typed.error);
    expect(typed.results.map((r) => r.path)).toEqual(["wiki/Pumpe.md"]);
    expect(typed.indexed).toBe(2);
    const other = await searchIndex({ settings: SETTINGS, db, wasm: WASM }, "x", 5, answering([1, 0]), "", undefined, read, { folder: "Fragmente/" });
    if (other.outcome !== "ok") throw new Error(other.error);
    expect(other.results).toEqual([]);

    const dotRel = await searchIndex({ settings: SETTINGS, db, wasm: WASM }, "x", 5, answering([1, 0]), "", undefined, read, { folder: "./wiki" });
    if (dotRel.outcome !== "ok") throw new Error(dotRel.error);
    expect(dotRel.results.map((r) => r.path)).toEqual(["wiki/Ventile.md", "wiki/Pumpe.md"]);
  });

  it("cuts a long paragraph and reads quoted and plain types", () => {
    const long = "Ventil ".repeat(100);
    expect(excerptFor(long, "Ventil").length).toBeLessThanOrEqual(400);
    expect(excerptFor(long, "Ventil").endsWith("…")).toBe(true);
    expect(excerptFor("", "x")).toBe("");
    expect(frontmatterType("---\ntype: 'definition'\n---\n")).toBe("definition");
    expect(frontmatterType("kein Frontmatter")).toBeNull();
  });
});
