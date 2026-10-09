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
  it("breaks tied scores by path before applying the limit, regardless of insertion order (#194)", async () => {
    for (const ids of [["c", "b", "a"], ["b", "a", "c"]]) {
      const store = new SqliteVectorStore(fakeApp());
      await store.syncPoints(ids.map((id) => point(id, [1, 0])));
      expect((await store.search([1, 0], 2)).map((hit) => hit.payload.path)).toEqual(["a.md", "b.md"]);
      expect((await store.search([1, 0], 0)).map((hit) => hit.payload.path)).toEqual(["a.md", "b.md", "c.md"]);
      await store.reconcile(["a.md", "c.md"]);
      await store.syncPoints([point("b", [1, 0])]);
      expect((await store.search([1, 0], 2)).map((hit) => hit.payload.path)).toEqual(["a.md", "b.md"]);
    }
  });
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

  describe("getVectors (F05: bulk hydration before layout)", () => {
    it("returns every requested path that has a stored vector", async () => {
      const store = new SqliteVectorStore(fakeApp());
      await store.syncPoints([point("a", [1, 0]), point("b", [0, 1]), point("c", [1, 1])]);

      const result = await store.getVectors(["a.md", "b.md"]);

      expect(result.get("a.md")).toEqual([1, 0]);
      expect(result.get("b.md")).toEqual([0, 1]);
      expect(result.has("c.md")).toBe(false);
    });

    it("omits requested paths that were never synced, instead of erroring", async () => {
      const store = new SqliteVectorStore(fakeApp());
      await store.syncPoints([point("a", [1, 0])]);

      const result = await store.getVectors(["a.md", "never-synced.md"]);

      expect(result.size).toBe(1);
      expect(result.has("never-synced.md")).toBe(false);
    });

    it("returns an empty map for an empty request without querying anything", async () => {
      const store = new SqliteVectorStore(fakeApp());
      expect(await store.getVectors([])).toEqual(new Map());
    });
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

    it("removes all stored vectors when given an empty path list (empty vault reconciliation, F03)", async () => {
      const store = new SqliteVectorStore(fakeApp());
      await store.syncPoints([point("a", [1, 0])]);

      const result = await store.reconcile([]);

      expect(result.removed).toBe(1);
      expect(await store.getVector("a")).toBeNull();
    });
  });

  describe("getVector", () => {
    it("returns a synced point's own vector", async () => {
      const store = new SqliteVectorStore(fakeApp());
      await store.syncPoints([point("a", [1, 2, 3])]);
      expect(await store.getVector("a")).toEqual([1, 2, 3]);
    });

    it("resolves vectors by either canonical id or file path", async () => {
      const store = new SqliteVectorStore(fakeApp());
      await store.syncPoints([
        { id: "work/overview", vector: [0.5, 0.5], payload: { path: "Work/Overview.md", title: "Overview", content: "text" } },
      ]);
      expect(await store.getVector("work/overview")).toEqual([0.5, 0.5]);
      expect(await store.getVector("Work/Overview.md")).toEqual([0.5, 0.5]);

      const byId = await store.getVectors(["work/overview"]);
      expect(byId.get("work/overview")).toEqual([0.5, 0.5]);

      const byPath = await store.getVectors(["Work/Overview.md"]);
      expect(byPath.get("Work/Overview.md")).toEqual([0.5, 0.5]);
    });

    it("returns null for an id that hasn't been synced", async () => {
      const store = new SqliteVectorStore(fakeApp());
      await store.syncPoints([point("a", [1, 0])]);
      expect(await store.getVector("unsynced")).toBeNull();
    });

    it("purges duplicate rows for the same path when re-synced under a different ID scheme (Issue #106 / F03)", async () => {
      const store = new SqliteVectorStore(fakeApp());
      // First synced with legacy raw path as ID
      await store.syncPoints([
        { id: "notes/sample.md", vector: [1, 0], payload: { path: "notes/sample.md", title: "Sample", content: "hello" } },
      ]);
      // Later synced with hash/canonical ID
      await store.syncPoints([
        { id: "notes/sample", vector: [0, 1], payload: { path: "notes/sample.md", title: "Sample", content: "hello" } },
      ]);

      const hits = await store.search([0, 1], 10);
      const matches = hits.filter((h) => h.payload.path === "notes/sample.md");
      expect(matches.length).toBe(1);
      expect(matches[0].score).toBeCloseTo(1);
    });
  });

  describe("getStoredHashes (Issue #63)", () => {
    it("returns stored contentHash and mtime mapped by id and path", async () => {
      const store = new SqliteVectorStore(fakeApp());
      await store.syncPoints([
        {
          id: "note-1",
          vector: [0.1, 0.2],
          payload: { path: "Folder/Note 1.md", title: "Note 1", content: "text" },
          contentHash: "hash-12345",
          mtime: 1700000000,
        },
      ]);

      const hashes = await store.getStoredHashes();
      expect(hashes.get("note-1")).toEqual({ hash: "hash-12345", mtime: 1700000000 });
      expect(hashes.get("Folder/Note 1.md")).toEqual({ hash: "hash-12345", mtime: 1700000000 });
    });

    it("omits rows where content_hash is null", async () => {
      const store = new SqliteVectorStore(fakeApp());
      await store.syncPoints([point("legacy", [0.5, 0.5])]);

      const hashes = await store.getStoredHashes();
      expect(hashes.has("legacy")).toBe(false);
      expect(hashes.has("legacy.md")).toBe(false);
    });
  });

  describe("embedding fingerprint scoping (#164)", () => {
    const hashed = (id: string, vector: number[]): VectorPoint => ({ ...point(id, vector), contentHash: `hash-${id}` });

    it("hides another fingerprint's vectors from hashes, lookups and search", async () => {
      const app = fakeApp();
      await new SqliteVectorStore(app, "model-a@local").syncPoints([hashed("a", [1, 0])]);
      const storeB = new SqliteVectorStore(app, "model-b@local");

      expect((await storeB.getStoredHashes()).size).toBe(0);
      expect(await storeB.getVector("a.md")).toBeNull();
      expect((await storeB.getVectors(["a.md"])).size).toBe(0);
      expect(await storeB.search([1, 0], 10)).toEqual([]);
    });

    it("keeps the matching fingerprint's rows visible", async () => {
      const app = fakeApp();
      await new SqliteVectorStore(app, "model-a@local").syncPoints([hashed("a", [1, 0])]);
      const storeA = new SqliteVectorStore(app, "model-a@local");

      expect((await storeA.getStoredHashes()).get("a.md")?.hash).toBe("hash-a");
      expect(await storeA.getVector("a.md")).toEqual([1, 0]);
      expect((await storeA.search([1, 0], 10)).map((h) => h.payload.path)).toEqual(["a.md"]);
    });

    it("re-embedding under a new fingerprint replaces the row instead of keeping both", async () => {
      const app = fakeApp();
      const storeA = new SqliteVectorStore(app, "model-a@local");
      const storeB = new SqliteVectorStore(app, "model-b@local");
      await storeA.syncPoints([hashed("a", [1, 0])]);
      await storeB.syncPoints([hashed("a", [0, 1])]);

      expect(await storeA.getVector("a.md")).toBeNull();
      expect(await storeB.getVector("a.md")).toEqual([0, 1]);
      expect((await new SqliteVectorStore(app).search([0, 1], 10)).length).toBe(1);
    });

    it("never adopts pre-fingerprint rows: they are cache misses and invisible to a scoped store (#176)", async () => {
      const files = new Map<string, ArrayBuffer>();
      await new SqliteVectorStore(fakeApp(files)).syncPoints([hashed("legacy", [1, 0])]);
      const diskBefore = files.get(".obsidian/plugins/memvector-knowledge-engine/memvector-local.sqlite");

      const scoped = new SqliteVectorStore(fakeApp(files), "model-a@local");
      expect((await scoped.getStoredHashes()).size).toBe(0);
      expect(await scoped.getVector("legacy.md")).toBeNull();
      expect((await scoped.getVectors(["legacy.md"])).size).toBe(0);
      expect(await scoped.search([1, 0], 10)).toEqual([]);
      // Opening a scoped store writes nothing.
      expect(files.get(".obsidian/plugins/memvector-knowledge-engine/memvector-local.sqlite")).toBe(diskBefore);

      // Still unattributed in a later session under another model.
      expect(await new SqliteVectorStore(fakeApp(files), "model-b@local").getVector("legacy.md")).toBeNull();
    });

    it("re-embedding a pre-fingerprint row replaces it under the active fingerprint (#176)", async () => {
      const app = fakeApp();
      await new SqliteVectorStore(app).syncPoints([hashed("legacy", [1, 0])]);
      const scoped = new SqliteVectorStore(app, "model-a@local");
      await scoped.syncPoints([hashed("legacy", [0, 1])]);

      expect(await scoped.getVector("legacy.md")).toEqual([0, 1]);
      expect((await new SqliteVectorStore(app).search([0, 1], 10)).length).toBe(1);
    });

    it("reconcile only removes rows matching its own fingerprint, preserving other models (#229)", async () => {
      const app = fakeApp();
      const storeA = new SqliteVectorStore(app, "model-a@local");
      const storeB = new SqliteVectorStore(app, "model-b@local");

      await storeA.syncPoints([hashed("note-a", [1, 0])]);
      await storeB.syncPoints([hashed("note-b1", [0, 1]), hashed("note-b2", [0, 1])]);

      // Reconcile storeB with only note-b1 (note-b2 removed from B's scope)
      const resB = await storeB.reconcile(["note-b1.md"]);
      expect(resB.removed).toBe(1);

      // storeB has note-b1, lost note-b2
      expect(await storeB.getVector("note-b1.md")).toEqual([0, 1]);
      expect(await storeB.getVector("note-b2.md")).toBeNull();

      // storeA still has note-a (completely untouched by storeB's reconcile, even though note-a.md was not in currentPaths)
      expect(await storeA.getVector("note-a.md")).toEqual([1, 0]);
    });
  });
});
