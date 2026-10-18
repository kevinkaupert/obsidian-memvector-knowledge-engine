import { readFileSync } from "fs";
import { resolve } from "path";
import initSqlJs, { type Database } from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import { migrateNoteKeysInDb } from "./noteKeyMigration";
import { pathToId } from "../../noteSlug";

const ULID = "01J9Z8Q4M5N6P7R8S9T0V1W2X3";
let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
  const wasm = readFileSync(resolve(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm"));
  SQL = await initSqlJs({ wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer });
});

function db(): Database {
  const d = new SQL.Database();
  d.run(`CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT, path TEXT);
    CREATE TABLE edges (src TEXT, tgt TEXT, type TEXT, description TEXT, bidirectional INTEGER, original_term TEXT, updated_at TEXT, PRIMARY KEY (src, tgt, type));
    CREATE TABLE vectors (id TEXT PRIMARY KEY, path TEXT, title TEXT, content TEXT, vector TEXT, content_hash TEXT, mtime INTEGER, embedding_fingerprint TEXT);
    CREATE TABLE node_positions (id TEXT PRIMARY KEY, path TEXT, x REAL NOT NULL, y REAL NOT NULL, updated_at INTEGER);`);
  return d;
}

function store(d: Database, id: string, path: string) {
  d.run("INSERT INTO notes VALUES (?, ?, ?)", [id, path.replace(/\.md$/, ""), path]);
  d.run("INSERT INTO vectors VALUES (?, ?, ?, 'c', '[1,2]', 'h', 1, 'fp')", [id, path, path.replace(/\.md$/, "")]);
  d.run("INSERT INTO node_positions VALUES (?, ?, 3, 4, 1)", [id, path]);
}

const rows = (d: Database, table: string) => d.exec(`SELECT * FROM ${table} ORDER BY 1, 2`)[0]?.values ?? [];

describe("migrateNoteKeysInDb (ADR-0007 section 3)", () => {
  it("moves all rows and edges when a note gains an id, keeping vector and position", () => {
    const d = db();
    store(d, pathToId("a.md"), "a.md");
    d.run("INSERT INTO edges VALUES (?, 'b', 'LINKS_TO', '', 0, NULL, 't'), ('c', ?, 'REQUIRES', 'd', 0, 'REQUIRES', 't')", [pathToId("a.md"), pathToId("a.md")]);
    expect(migrateNoteKeysInDb(d, [{ path: "a.md", key: ULID, title: "a" }])).toBeGreaterThan(0);
    expect(rows(d, "notes")).toEqual([[ULID, "a", "a.md"]]);
    expect(rows(d, "vectors")).toEqual([[ULID, "a.md", "a", "c", "[1,2]", "h", 1, "fp"]]);
    expect(rows(d, "node_positions")).toEqual([[ULID, "a.md", 3, 4, 1]]);
    expect(rows(d, "edges").map((e) => [e[0], e[1]])).toEqual([[ULID, "b"], ["c", ULID]]);
  });

  it("moves rows back to the path key when a note loses its id", () => {
    const d = db();
    store(d, ULID, "a.md");
    migrateNoteKeysInDb(d, [{ path: "a.md", key: pathToId("a.md"), title: "a" }]);
    expect(rows(d, "vectors")[0][0]).toBe(pathToId("a.md"));
    expect(rows(d, "node_positions")[0][0]).toBe(pathToId("a.md"));
  });

  it("finds a note with id renamed while MemVector was not running", () => {
    const d = db();
    store(d, ULID, "old/a.md");
    d.run("INSERT INTO edges VALUES ('x', ?, 'LINKS_TO', '', 0, NULL, 't')", [ULID]);
    migrateNoteKeysInDb(d, [{ path: "new/b.md", key: ULID, title: "b" }]);
    expect(rows(d, "notes")).toEqual([[ULID, "b", "new/b.md"]]);
    expect(rows(d, "vectors")).toEqual([[ULID, "new/b.md", "b", "c", "[1,2]", "h", 1, "fp"]]);
    expect(rows(d, "node_positions")).toEqual([[ULID, "new/b.md", 3, 4, 1]]);
    expect(rows(d, "edges")[0][1]).toBe(ULID);
  });

  it("keeps the id-keyed row when an older build re-created the note under its path key", () => {
    const d = db();
    store(d, ULID, "old/a.md");
    d.run("INSERT INTO vectors VALUES (?, 'new/a.md', 'a', 'c', '[9]', 'h2', 2, 'fp')", [pathToId("new/a.md")]);
    migrateNoteKeysInDb(d, [{ path: "new/a.md", key: ULID, title: "a" }]);
    expect(rows(d, "vectors")).toEqual([[ULID, "new/a.md", "a", "c", "[1,2]", "h", 1, "fp"]]);
  });

  it("keeps each note's rows when a duplicated id changes owner", () => {
    const d = db();
    store(d, ULID, "z.md");
    d.run("INSERT INTO node_positions VALUES (?, 'a.md', 7, 8, 1)", [pathToId("a.md")]);
    migrateNoteKeysInDb(d, [
      { path: "a.md", key: ULID, title: "a" },
      { path: "z.md", key: pathToId("z.md"), title: "z" },
    ], (p, key) => key === ULID && (p === "a.md" || p === "z.md"));
    expect(rows(d, "node_positions")).toEqual([[ULID, "a.md", 7, 8, 1], [pathToId("z.md"), "z.md", 3, 4, 1]]);
    expect(rows(d, "vectors").map((r) => [r[0], r[1]])).toEqual([[pathToId("z.md"), "z.md"]]);
  });

  it("keeps the history with a note moved offline when a new note took its old path", () => {
    const d = db();
    store(d, ULID, "a.md");
    migrateNoteKeysInDb(d, [
      { path: "b.md", key: ULID, title: "b" },
      { path: "a.md", key: pathToId("a.md"), title: "a" },
    ]);
    expect(rows(d, "node_positions")).toEqual([[ULID, "b.md", 3, 4, 1]]);
  });

  it("changes nothing for notes without id that kept their path", () => {
    const d = db();
    store(d, pathToId("a.md"), "a.md");
    expect(migrateNoteKeysInDb(d, [{ path: "a.md", key: pathToId("a.md"), title: "a" }])).toBe(0);
  });
});

describe("rename of a note with id while MemVector runs", () => {
  it("keeps the id key in vectors, positions and graph", async () => {
    const { SqliteVectorStore } = await import("./sqliteVectorStore");
    const { SqliteGraphStore } = await import("./sqliteGraphStore");
    const { moveNodePosition, saveNodePositions } = await import("./nodePositions");
    const { closeLocalDb, getLocalDb } = await import("./sqliteDb");
    await closeLocalDb();
    const files = new Map<string, ArrayBuffer>();
    const wasm = readFileSync(resolve(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm"));
    files.set(".obsidian/plugins/memvector-knowledge-engine/sql-wasm.wasm", wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer);
    const note = { path: "new/b.md", basename: "b" };
    const app = {
      vault: {
        configDir: ".obsidian",
        getMarkdownFiles: () => [note],
        adapter: {
          exists: async (p: string) => files.has(p),
          readBinary: async (p: string) => files.get(p)!,
          writeBinary: async (p: string, data: ArrayBuffer) => void files.set(p, data),
        },
      },
      metadataCache: { getFileCache: () => ({ frontmatter: { id: ULID } }) },
    } as never;

    const vectors = new SqliteVectorStore(app, "fp");
    await vectors.syncPoints([{ id: ULID, vector: [1], payload: { path: "old/a.md", title: "a", content: "" }, contentHash: "h" }]);
    await saveNodePositions(app, [{ id: ULID, path: "old/a.md", x: 1, y: 2 }]);
    const graph = new SqliteGraphStore(app);
    await graph.upsertNoteNode?.({ id: ULID, title: "a", path: "old/a.md" });

    expect(await vectors.moveVector("old/a.md", "new/b.md", "b")).toBe(true);
    await moveNodePosition(app, "old/a.md", "new/b.md");
    await graph.moveNote?.("old/a.md", "new/b.md", "b");

    const d = await getLocalDb(app);
    expect(rows(d, "vectors").map((r) => [r[0], r[1]])).toEqual([[ULID, "new/b.md"]]);
    expect(rows(d, "node_positions").map((r) => [r[0], r[1]])).toEqual([[ULID, "new/b.md"]]);
    expect(rows(d, "notes")).toEqual([[ULID, "b", "new/b.md"]]);
    await closeLocalDb();
  });
});
