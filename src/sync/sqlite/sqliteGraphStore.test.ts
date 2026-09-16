import { readFileSync } from "fs";
import { resolve } from "path";
import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { SqliteGraphStore } from "./sqliteGraphStore";

/**
 * In-memory fake of just enough of app.vault.adapter for sqliteDb.ts to
 * open/persist a real sql.js database - backed by the real sql-wasm.wasm
 * bytes so this exercises the actual engine, not a mock of it. Pass the same
 * `files` Map to two calls to simulate two separate plugin-load sessions
 * sharing one on-disk file (sqliteDb.ts caches its db handle per `App`
 * *reference*, so a fresh object is required to force a real reload).
 */
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

function node(id: string): { id: string; title: string; path: string; type: string } {
  return { id, title: id, path: `${id}.md`, type: "definition" };
}

describe("SqliteGraphStore", () => {
  it("syncs vault nodes/edges and reports counts", async () => {
    const store = new SqliteGraphStore(fakeApp());
    const result = await store.syncVaultGraph([node("a"), node("b")], [{ src: "a", tgt: "b", type: "LINKS_TO" }]);
    expect(result).toEqual({ nodeCount: 2, edgeCount: 1 });
  });

  it("upserts a typed edge and finds it via fetchNeighbors", async () => {
    const store = new SqliteGraphStore(fakeApp());
    await store.upsertTypedEdges([{ src: node("a"), tgt: node("b"), relType: "REQUIRES", description: "test", bidirectional: false, originalTerm: "basiert auf" }]);
    const neighbors = await store.fetchNeighbors(["a"], 1, 10);
    expect(neighbors.map((n) => n.id)).toEqual(["b"]);
  });

  it("updates an existing typed edge's description on a second upsert instead of duplicating it", async () => {
    const store = new SqliteGraphStore(fakeApp());
    await store.upsertTypedEdges([{ src: node("a"), tgt: node("b"), relType: "REQUIRES", description: "first" }]);
    await store.upsertTypedEdges([{ src: node("a"), tgt: node("b"), relType: "REQUIRES", description: "second" }]);
    const neighbors = await store.fetchNeighbors(["a"], 1, 10);
    expect(neighbors.length).toBe(1);
  });

  it("deletes an edge so it no longer appears in fetchNeighbors", async () => {
    const store = new SqliteGraphStore(fakeApp());
    await store.upsertTypedEdges([{ src: node("a"), tgt: node("b"), relType: "REQUIRES", description: "" }]);
    await store.deleteEdge("a", "b", "REQUIRES");
    const neighbors = await store.fetchNeighbors(["a"], 1, 10);
    expect(neighbors).toEqual([]);
  });

  describe("syncVaultGraph reconciliation (F03)", () => {
    it("removes a deleted note and its edge on the next full sync", async () => {
      const store = new SqliteGraphStore(fakeApp());
      await store.syncVaultGraph([node("a"), node("b")], [{ src: "a", tgt: "b", type: "LINKS_TO" }]);

      // b.md was deleted - a real re-index would no longer produce it or its edge.
      await store.syncVaultGraph([node("a")], []);

      const neighbors = await store.fetchNeighbors(["a"], 1, 10);
      expect(neighbors).toEqual([]);
    });

    it("removes a stale edge when a WikiLink is removed, even though both notes still exist", async () => {
      const store = new SqliteGraphStore(fakeApp());
      await store.syncVaultGraph([node("a"), node("b")], [{ src: "a", tgt: "b", type: "LINKS_TO" }]);

      // The WikiLink to b was removed from a's body, but neither note was deleted.
      await store.syncVaultGraph([node("a"), node("b")], []);

      const neighbors = await store.fetchNeighbors(["a"], 1, 10);
      expect(neighbors).toEqual([]);
    });

    it("does not touch a typed relation edge that a fresh scan wouldn't regenerate on its own, as long as it's still included in the synced edge set", async () => {
      const store = new SqliteGraphStore(fakeApp());
      await store.upsertTypedEdges([{ src: node("a"), tgt: node("b"), relType: "REQUIRES", description: "" }]);

      // A real full re-index includes typed-relation edges alongside WikiLink edges (vaultGraphSync.ts).
      await store.syncVaultGraph([node("a"), node("b")], [{ src: "a", tgt: "b", type: "REQUIRES" }]);

      const neighbors = await store.fetchNeighbors(["a"], 1, 10);
      expect(neighbors.map((n) => n.id)).toEqual(["b"]);
    });

    it("clears all notes and edges when given an empty node list (empty vault reconciliation, F03)", async () => {
      const store = new SqliteGraphStore(fakeApp());
      await store.syncVaultGraph([node("a"), node("b")], [{ src: "a", tgt: "b", type: "LINKS_TO" }]);

      await store.syncVaultGraph([], []);

      const neighbors = await store.fetchNeighbors(["a"], 1, 10);
      expect(neighbors).toEqual([]);
    });
  });

  it("persists data to the on-disk file so a fresh plugin-load session can read it back", async () => {
    const files = new Map<string, ArrayBuffer>();
    await new SqliteGraphStore(fakeApp(files)).upsertTypedEdges([{ src: node("a"), tgt: node("b"), relType: "REQUIRES", description: "" }]);

    // A distinct `App` reference forces sqliteDb.ts to reload from the persisted bytes in `files`, not reuse a cached in-memory handle.
    const reopened = new SqliteGraphStore(fakeApp(files));
    const neighbors = await reopened.fetchNeighbors(["a"], 1, 10);
    expect(neighbors.map((n) => n.id)).toEqual(["b"]);
  });
});
