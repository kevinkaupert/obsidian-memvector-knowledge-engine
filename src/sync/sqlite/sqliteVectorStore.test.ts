import { readFileSync } from "fs";
import { resolve } from "path";
import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import type { VectorPoint } from "../vectorStore";
import { SqliteVectorStore } from "./sqliteVectorStore";

/** Same fake app.vault.adapter pattern as sqliteGraphStore.test.ts - real sql.js engine, no Obsidian instance needed. */
function fakeApp(files: Map<string, ArrayBuffer> = new Map()): App {
  const configDir = ".obsidian";
  const wasmPath = `${configDir}/plugins/memvector-knowledge-engine/sql-wasm.wasm`;
  if (!files.has(wasmPath)) {
    const wasmBytes = readFileSync(resolve(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm"));
    files.set(wasmPath, wasmBytes.buffer.slice(wasmBytes.byteOffset, wasmBytes.byteOffset + wasmBytes.byteLength));
  }

  return {
    vault: {
      configDir,
      adapter: {
        exists: async (path: string) => files.has(path),
        readBinary: async (path: string) => {
          const buf = files.get(path);
          if (!buf) throw new Error(`fakeApp: no such file ${path}`);
          return buf;
        },
        writeBinary: async (path: string, data: ArrayBuffer) => {
          files.set(path, data);
        },
      },
    },
  } as unknown as App;
}

function point(id: string, vector: number[]): VectorPoint {
  return { id, vector, payload: { path: `${id}.md`, title: id, content: `content of ${id}` } };
}

describe("SqliteVectorStore", () => {
  it("finds the closest vector by cosine similarity", async () => {
    const store = new SqliteVectorStore(fakeApp());
    await store.syncPoints([point("close", [1, 0, 0]), point("far", [0, 1, 0]), point("opposite", [-1, 0, 0])]);

    const hits = await store.search([1, 0, 0], 3);
    expect(hits[0].payload.path).toBe("close.md");
    expect(hits[hits.length - 1].payload.path).toBe("opposite.md");
  });

  it("respects the limit", async () => {
    const store = new SqliteVectorStore(fakeApp());
    await store.syncPoints([point("a", [1, 0]), point("b", [0, 1]), point("c", [1, 1])]);
    const hits = await store.search([1, 0], 2);
    expect(hits.length).toBe(2);
  });

  it("updates an existing point's vector on a second sync instead of duplicating it", async () => {
    const store = new SqliteVectorStore(fakeApp());
    await store.syncPoints([point("a", [1, 0])]);
    await store.syncPoints([point("a", [0, 1])]);
    const hits = await store.search([0, 1], 10);
    expect(hits.length).toBe(1);
    expect(hits[0].score).toBeCloseTo(1);
  });

  it("persists across sessions sharing the same on-disk file", async () => {
    const files = new Map<string, ArrayBuffer>();
    await new SqliteVectorStore(fakeApp(files)).syncPoints([point("a", [1, 0])]);
    const reopened = new SqliteVectorStore(fakeApp(files));
    const hits = await reopened.search([1, 0], 10);
    expect(hits.map((h) => h.payload.path)).toEqual(["a.md"]);
  });

  describe("reconcile (F03)", () => {
    it("removes a deleted note's vector on the next full sync", async () => {
      const store = new SqliteVectorStore(fakeApp());
      await store.syncPoints([point("a", [1, 0]), point("b", [0, 1])]);

      // b.md was deleted - a real re-index would no longer include it.
      const result = await store.reconcile(["a.md"]);

      expect(result.removed).toBe(1);
      expect(await store.getVector("b")).toBeNull();
      const hits = await store.search([0, 1], 10);
      expect(hits.map((h) => h.payload.path)).not.toContain("b.md");
    });

    it("keeps a note's vector even if its embedding attempt failed this run, as long as it's still in the current path list", async () => {
      const store = new SqliteVectorStore(fakeApp());
      await store.syncPoints([point("a", [1, 0])]);

      // a.md is still a valid, included file - just didn't get a fresh embedding this pass.
      const result = await store.reconcile(["a.md"]);

      expect(result.removed).toBe(0);
      expect(await store.getVector("a")).toEqual([1, 0]);
    });

    it("never deletes anything when given an empty path list, so an aborted/failed sync can't wipe valid data", async () => {
      const store = new SqliteVectorStore(fakeApp());
      await store.syncPoints([point("a", [1, 0])]);

      const result = await store.reconcile([]);

      expect(result.removed).toBe(0);
      expect(await store.getVector("a")).toEqual([1, 0]);
    });
  });

  describe("getVector", () => {
    it("returns a synced point's own vector", async () => {
      const store = new SqliteVectorStore(fakeApp());
      await store.syncPoints([point("a", [1, 2, 3])]);
      expect(await store.getVector("a")).toEqual([1, 2, 3]);
    });

    it("returns null for an id that hasn't been synced", async () => {
      const store = new SqliteVectorStore(fakeApp());
      await store.syncPoints([point("a", [1, 0])]);
      expect(await store.getVector("unsynced")).toBeNull();
    });
  });
});
