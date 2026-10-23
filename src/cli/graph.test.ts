import { readFileSync } from "fs";
import { resolve } from "path";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { graphNeighbors } from "./graph";

const WASM = readFileSync(resolve(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm"));

/** An index with the plugin's notes and edges tables (sqliteDb.ts SCHEMA). */
async function index(): Promise<Uint8Array> {
  const SQL = await initSqlJs({ wasmBinary: WASM.buffer.slice(WASM.byteOffset, WASM.byteOffset + WASM.byteLength) as ArrayBuffer });
  const db = new SQL.Database();
  db.run(`CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT, path TEXT);
          CREATE TABLE edges (src TEXT, tgt TEXT, type TEXT, description TEXT, bidirectional INTEGER,
            original_term TEXT, updated_at TEXT, PRIMARY KEY (src, tgt, type));`);
  for (const [id, title, path] of [["v", "Ventil", "wiki/Ventil.md"], ["d", "Dichtung", "wiki/Dichtung.md"], ["h", "Heizkreis", "wiki/Heizkreis.md"], ["s", "Schieber", "wiki/Schieber.md"]]) {
    db.run("INSERT INTO notes VALUES (?, ?, ?)", [id, title, path]);
  }
  db.run("INSERT INTO edges VALUES ('v', 'd', 'REQUIRES', 'braucht eine Dichtung', 0, NULL, '')");
  db.run("INSERT INTO edges VALUES ('h', 'v', 'EXAMPLE_OF', '', 0, NULL, '')");
  db.run("INSERT INTO edges VALUES ('v', 's', 'EQUIVALENT_TO', '', 1, NULL, '')");
  db.run("INSERT INTO edges VALUES ('v', 'v', 'REQUIRES', '', 0, NULL, '')");
  const bytes = db.export();
  db.close();
  return bytes;
}

describe("memvector graph neighbors (Plan 0017 step 2)", () => {
  it("lists a note's relations with direction and the other note", async () => {
    const result = await graphNeighbors(await index(), WASM, "wiki/Ventil.md");
    expect(result).toEqual({
      v: 1,
      outcome: "ok",
      data: {
        note: "wiki/Ventil.md",
        title: "Ventil",
        neighbors: [
          { type: "EQUIVALENT_TO", direction: "out", bidirectional: true, path: "wiki/Schieber.md", title: "Schieber", description: "" },
          { type: "EXAMPLE_OF", direction: "in", bidirectional: false, path: "wiki/Heizkreis.md", title: "Heizkreis", description: "" },
          { type: "REQUIRES", direction: "out", bidirectional: false, path: "wiki/Dichtung.md", title: "Dichtung", description: "braucht eine Dichtung" },
        ],
        truncated: false,
      },
    });
  });

  it("cuts at the limit and reports a note the graph does not know", async () => {
    const db = await index();
    const cut = await graphNeighbors(db, WASM, "wiki/Ventil.md", 1);
    expect(cut.outcome === "ok" && [cut.data.neighbors.length, cut.data.truncated]).toEqual([1, true]);
    expect(await graphNeighbors(db, WASM, "wiki/Nichts.md")).toMatchObject({ outcome: "error", error: { code: "NOTE_NOT_INDEXED" } });
  });

  it("reports a file that is not an index", async () => {
    expect(await graphNeighbors(new TextEncoder().encode("kein sqlite"), WASM, "x.md")).toMatchObject({ outcome: "error", error: { code: "INDEX_UNREADABLE" } });
  });
});
