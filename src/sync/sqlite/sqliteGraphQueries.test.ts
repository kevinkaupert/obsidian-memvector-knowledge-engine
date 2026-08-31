import initSqlJs, { type Database } from "sql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildNeighborQuery } from "./sqliteGraphQueries";

let db: Database;

function execRows(sql: string, params: (string | number)[]): Record<string, unknown>[] {
  const result = db.exec(sql, params);
  if (result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row) => Object.fromEntries(columns.map((col, i) => [col, row[i]])));
}

beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.run(`
    CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT, path TEXT);
    CREATE TABLE edges (src TEXT, tgt TEXT, type TEXT);
  `);
  // chain: a - b - c - d, plus an isolated note "far"
  for (const id of ["a", "b", "c", "d", "far"]) {
    db.run("INSERT INTO notes (id, title, path) VALUES (?, ?, ?)", [id, id, `${id}.md`]);
  }
  db.run("INSERT INTO edges (src, tgt, type) VALUES (?, ?, ?)", ["a", "b", "REQUIRES"]);
  db.run("INSERT INTO edges (src, tgt, type) VALUES (?, ?, ?)", ["b", "c", "REQUIRES"]);
  db.run("INSERT INTO edges (src, tgt, type) VALUES (?, ?, ?)", ["c", "d", "REQUIRES"]);
});

afterAll(() => db.close());

describe("buildNeighborQuery against a real sql.js instance", () => {
  it("finds only the direct neighbor at hops=1", () => {
    const { sql, params } = buildNeighborQuery(["a"], 1, 10);
    const rows = execRows(sql, params);
    expect(rows.map((r) => r.id)).toEqual(["b"]);
  });

  it("reaches two hops out and excludes the seed itself", () => {
    const { sql, params } = buildNeighborQuery(["a"], 2, 10);
    const rows = execRows(sql, params);
    expect(rows.map((r) => r.id).sort()).toEqual(["b", "c"]);
  });

  it("does not include a note with no path to the seed", () => {
    const { sql, params } = buildNeighborQuery(["a"], 4, 10);
    const rows = execRows(sql, params);
    expect(rows.map((r) => r.id)).not.toContain("far");
  });

  it("respects the limit", () => {
    const { sql, params } = buildNeighborQuery(["a"], 4, 1);
    const rows = execRows(sql, params);
    expect(rows.length).toBe(1);
  });

  it("unions neighbors from multiple seeds", () => {
    const { sql, params } = buildNeighborQuery(["a", "d"], 1, 10);
    const rows = execRows(sql, params);
    expect(rows.map((r) => r.id).sort()).toEqual(["b", "c"]);
  });
});
