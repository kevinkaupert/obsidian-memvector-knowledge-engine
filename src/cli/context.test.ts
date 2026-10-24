import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../settings/defaults";
import { migrateSettings } from "../settings/secrets";
import { resolveEmbeddingTarget } from "../sync/embeddingTarget";
import { contextFor } from "./context";

const WASM = require("fs").readFileSync(resolve(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm")) as Uint8Array;
const FINGERPRINT = resolveEmbeddingTarget(DEFAULT_SETTINGS).fingerprint;

/** The valve case: Ventil REQUIRES Dichtung, Dichtung REQUIRES Gummi (2 hops), Heizkreis close in meaning. */
const NOTES: Array<[string, string, string, number[] | null]> = [
  ["v", "Ventil", "wiki/Ventil.md", [1, 0, 0]],
  ["d", "Dichtung", "wiki/Dichtung.md", [0, 1, 0]],
  ["g", "Gummi", "wiki/Gummi.md", [0, 0, 1]],
  ["h", "Heizkreis", "wiki/Heizkreis.md", [0.95, 0.05, 0]],
  ["p", "Pumpe", "wiki/Pumpe.md", [0.9, 0.1, 0]],
  // Close enough for minVectorSimilarity, but below Heizkreis and Pumpe: reached only with an unlimited vector leg
  ["x", "Geheim", "privat/Geheim.md", [0.8, 0.3, 0.3]],
  ["alt", "Gelöscht", "wiki/Geloescht.md", [0.8, 0.4, 0.2]],
];

async function fixture(): Promise<{ vault: string; db: Uint8Array }> {
  const vault = mkdtempSync(join(tmpdir(), "mv-context-"));
  for (const [, title, path] of NOTES) {
    if (path === "wiki/Geloescht.md") continue; // a stale index row: the file is gone
    mkdirSync(join(vault, path, ".."), { recursive: true });
    writeFileSync(join(vault, path), `---\ntype: concept\n---\n# ${title}\n\nText über ${title}.`);
  }
  const SQL = await initSqlJs({ wasmBinary: WASM.buffer.slice(WASM.byteOffset, WASM.byteOffset + WASM.byteLength) as ArrayBuffer });
  const db = new SQL.Database();
  db.run(`CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT, path TEXT);
          CREATE TABLE edges (src TEXT, tgt TEXT, type TEXT, description TEXT, bidirectional INTEGER,
            original_term TEXT, updated_at TEXT, PRIMARY KEY (src, tgt, type));
          CREATE TABLE vectors (id TEXT PRIMARY KEY, path TEXT, title TEXT, content TEXT, vector TEXT,
            content_hash TEXT, mtime INTEGER, embedding_fingerprint TEXT);`);
  for (const [id, title, path, vector] of NOTES) {
    db.run("INSERT INTO notes VALUES (?, ?, ?)", [id, title, path]);
    if (vector) db.run("INSERT INTO vectors VALUES (?, ?, ?, ?, ?, '', 0, ?)", [id, path, title, "alt", JSON.stringify(vector), FINGERPRINT]);
  }
  db.run("INSERT INTO edges VALUES ('v', 'd', 'REQUIRES', 'braucht eine Dichtung', 0, NULL, '')");
  db.run("INSERT INTO edges VALUES ('d', 'g', 'REQUIRES', '', 0, NULL, '')");
  const bytes = db.export();
  db.close();
  return { vault, db: bytes };
}

const settings = (extra: Record<string, unknown> = {}) => migrateSettings({ vectorSearchExclusions: "-privat/", ...extra });

describe("memvector context (knowOS Plan 0018 step 2)", () => {
  it("assembles vector and graph neighbors of a seed as the synthesis does", async () => {
    const { vault, db } = await fixture();
    const result = await contextFor(vault, settings(), db, WASM, ["wiki/Ventil.md"]);
    expect(result.outcome).toBe("ok");
    if (result.outcome !== "ok") return;
    const { data } = result;
    expect(data.channels).toEqual({ vector: "ready", graph: "ready" });
    expect(data.seeds).toEqual([{ path: "wiki/Ventil.md", title: "Ventil" }]);
    // Vector: Heizkreis and Pumpe (limit 2); graph: Dichtung (1 hop), Gummi (2 hops)
    expect(data.hits.map((h) => [h.path, h.origin, h.hops])).toEqual([
      ["wiki/Heizkreis.md", "vector", null],
      ["wiki/Pumpe.md", "vector", null],
      ["wiki/Dichtung.md", "graph", 1],
      ["wiki/Gummi.md", "graph", 2],
    ]);
    expect(data.hits[2].excerpt).toBe("# Dichtung\n\nText über Dichtung.");
    expect(data.relations).toEqual([
      { from: "wiki/Dichtung.md", to: "wiki/Gummi.md", type: "REQUIRES", description: "" },
      { from: "wiki/Ventil.md", to: "wiki/Dichtung.md", type: "REQUIRES", description: "braucht eine Dichtung" },
    ]);
    expect(data.index).toEqual({ model: resolveEmbeddingTarget(DEFAULT_SETTINGS).model, fingerprint: FINGERPRINT, indexed: 7 });
    expect(data.parameters.minVectorSimilarity).toEqual({ value: DEFAULT_SETTINGS.minVectorSimilarity, source: "settings" });
  });

  it("takes every limit from the settings, merged with the plugin's defaults", async () => {
    const { vault, db } = await fixture();
    const result = await contextFor(vault, settings({ synthesisHopDepth: 1, vectorNeighborLimit: 1, synthesisContentCapChars: 5 }), db, WASM, ["wiki/Ventil.md"]);
    expect(result.outcome === "ok" && result.data.hits.map((h) => [h.path, h.excerpt])).toEqual([
      ["wiki/Heizkreis.md", "# Hei"],
      ["wiki/Dichtung.md", "# Dic"],
    ]);
    // Unlimited vector leg: the excluded note (privat/) and the deleted one are skipped; minVectorSimilarity is 0.75
    // when data.json does not set it, as in the plugin, so Dichtung and Gummi (0.0) are no vector hits
    const strict = await contextFor(vault, settings({ vectorNeighborLimit: 0 }), db, WASM, ["wiki/Ventil.md"]);
    expect(strict.outcome === "ok" && strict.data.hits.filter((h) => h.origin !== "graph").map((h) => h.path)).toEqual(["wiki/Heizkreis.md", "wiki/Pumpe.md"]);
  });

  it("reports an unindexed vector channel and keeps the graph hits", async () => {
    const { vault, db } = await fixture();
    const result = await contextFor(vault, settings({ embeddingModel: "anderes-modell" }), db, WASM, ["wiki/Ventil.md"]);
    expect(result.outcome === "ok" && [result.data.channels, result.data.hits.map((h) => h.path)]).toEqual([
      { vector: "unindexed", graph: "ready" }, ["wiki/Dichtung.md", "wiki/Gummi.md"],
    ]);
  });

  it("reads an equivalent spelling of a seed path as the indexed path", async () => {
    const { vault, db } = await fixture();
    const canonical = await contextFor(vault, settings(), db, WASM, ["wiki/Ventil.md"]);
    const dotted = await contextFor(vault, settings(), db, WASM, ["./wiki//Ventil.md", "wiki/Ventil.md"]);
    expect(dotted).toEqual(canonical);
  });

  it("refuses a seed that is not a note in the vault, and a broken index", async () => {
    const { vault, db } = await fixture();
    expect(await contextFor(vault, settings(), db, WASM, ["wiki/Geloescht.md"])).toMatchObject({ outcome: "error", error: { code: "SEED_NOT_FOUND" } });
    expect(await contextFor(vault, settings(), db, WASM, ["../aussen.md"])).toMatchObject({ outcome: "error", error: { code: "SEED_NOT_FOUND" } });
    expect(await contextFor(vault, settings(), new TextEncoder().encode("kein sqlite"), WASM, ["wiki/Ventil.md"])).toMatchObject({ outcome: "error", error: { code: "INDEX_UNREADABLE" } });
  });
});
