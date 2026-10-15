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

  it("adversarial (Issue #120): a bidirectional relation saved live is immediately traversable from both endpoints without a re-index", async () => {
    const store = new SqliteGraphStore(fakeApp());
    await store.upsertTypedEdges([{ src: node("a"), tgt: node("b"), relType: "EQUIVALENT_TO", description: "same concept", bidirectional: true, originalTerm: "äquivalent zu" }]);

    const fromA = await store.fetchNeighbors(["a"], 1, 10);
    const fromB = await store.fetchNeighbors(["b"], 1, 10);

    expect(fromA.map((n) => n.id)).toEqual(["b"]);
    expect(fromB.map((n) => n.id)).toEqual(["a"]);
  });

  it("(Issue #120): a live-saved bidirectional relation stores a reverse row, matching syncVaultGraph", async () => {
    const store = new SqliteGraphStore(fakeApp());
    await store.upsertTypedEdges([{ src: node("a"), tgt: node("b"), relType: "REQUIRES", description: "", bidirectional: true }]);

    // Deleting only the forward row must leave the stored reverse row intact,
    // exactly like a full re-index would have produced it (vaultGraphSync.ts).
    await store.deleteEdge("a", "b", "REQUIRES");
    const fromB = await store.fetchNeighbors(["b"], 1, 10);
    expect(fromB.map((n) => n.id)).toEqual(["a"]);
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

    it("adversarial (Issue #183): reconcileEdges: false preserves existing edges when incoming edges list is empty", async () => {
      const store = new SqliteGraphStore(fakeApp());
      await store.upsertTypedEdges([{ src: node("a"), tgt: node("b"), relType: "REQUIRES", description: "" }]);

      // Full sync with empty edges, but reconcileEdges: false (e.g. upstream failure)
      await store.syncVaultGraph([node("a"), node("b")], [], { reconcileEdges: false });

      const neighbors = await store.fetchNeighbors(["a"], 1, 10);
      expect(neighbors.map((n) => n.id)).toEqual(["b"]);
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

  describe("Graph traversal deduplication & per-hop quotas (Issue #102, #103)", () => {
    it("deduplicates multi-path nodes by minimum hop distance (Issue #102)", async () => {
      const store = new SqliteGraphStore(fakeApp());
      // Setup: a -> b -> c -> d (3 hops), but also direct a -> d (1 hop)
      const nodes = [node("a"), node("b"), node("c"), node("d")];
      const edges = [
        { src: "a", tgt: "b", type: "LINKS_TO" },
        { src: "b", tgt: "c", type: "LINKS_TO" },
        { src: "c", tgt: "d", type: "LINKS_TO" },
        { src: "a", tgt: "d", type: "LINKS_TO" },
      ];
      await store.syncVaultGraph(nodes, edges);

      const neighbors = await store.fetchNeighbors(["a"], 3, 10);
      const dMatches = neighbors.filter((n) => n.id === "d");
      expect(dMatches.length).toBe(1);
      expect(dMatches[0].hops).toBe(1);
    });

    it("adversarial: dense hop-1 neighborhood does not crowd out deeper hops when perHopLimit is used", async () => {
      const store = new SqliteGraphStore(fakeApp());
      const nodes = [node("seed")];
      const edges: { src: string; tgt: string; type: string }[] = [];

      // Create 30 hop-1 neighbors
      for (let i = 1; i <= 30; i++) {
        const id = `hop1_${String(i).padStart(2, "0")}`;
        nodes.push(node(id));
        edges.push({ src: "seed", tgt: id, type: "LINKS_TO" });
      }

      // Add hop-2 neighbor attached to hop1_01
      nodes.push(node("hop2_target"));
      edges.push({ src: "hop1_01", tgt: "hop2_target", type: "LINKS_TO" });

      await store.syncVaultGraph(nodes, edges);

      // Total limit = 6, perHopLimit = 2: Hop 1 gives at most 2, allowing Hop 2 to be returned!
      const neighbors = await store.fetchNeighbors(["seed"], 2, 6, 2);

      const hop1Nodes = neighbors.filter((n) => n.hops === 1);
      const hop2Nodes = neighbors.filter((n) => n.hops === 2);

      expect(hop1Nodes.length).toBeLessThanOrEqual(2);
      expect(hop2Nodes.some((n) => n.id === "hop2_target")).toBe(true);
    });

    it("returns all reachable notes when limit <= 0 (unconstrained)", async () => {
      const store = new SqliteGraphStore(fakeApp());
      const nodes = [node("seed")];
      const edges: { src: string; tgt: string; type: string }[] = [];

      for (let i = 1; i <= 25; i++) {
        const id = `node_${i}`;
        nodes.push(node(id));
        edges.push({ src: "seed", tgt: id, type: "LINKS_TO" });
      }

      await store.syncVaultGraph(nodes, edges);

      const neighbors = await store.fetchNeighbors(["seed"], 1, 0, 0);
      expect(neighbors.length).toBe(25);
    });
  });

  describe("incremental mutations (Issue #250)", () => {
    it("moves note and updates incoming and outgoing edges on rename", async () => {
      const store = new SqliteGraphStore(fakeApp());
      await store.syncVaultGraph(
        [node("a"), node("b"), node("c")],
        [
          { src: "a", tgt: "b", type: "LINKS_TO" },
          { src: "c", tgt: "a", type: "REQUIRES" },
        ]
      );

      const moved = await store.moveNote("a.md", "a_renamed.md", "a_renamed");
      expect(moved).toBe(true);

      // Old note ID should not be found in neighbors
      const neighborsB = await store.fetchNeighbors(["b"], 1, 10);
      expect(neighborsB.map((n) => n.id)).toContain("a_renamed");
      expect(neighborsB.map((n) => n.id)).not.toContain("a");

      const neighborsC = await store.fetchNeighbors(["c"], 1, 10);
      expect(neighborsC.map((n) => n.id)).toContain("a_renamed");
    });

    it("deletes note and its edges", async () => {
      const store = new SqliteGraphStore(fakeApp());
      await store.syncVaultGraph(
        [node("a"), node("b")],
        [{ src: "a", tgt: "b", type: "LINKS_TO" }]
      );

      const deleted = await store.deleteNote("a.md");
      expect(deleted).toBe(true);

      const neighborsB = await store.fetchNeighbors(["b"], 1, 10);
      expect(neighborsB.length).toBe(0);
    });

    it("upserts note node and replaces outgoing wikilinks", async () => {
      const store = new SqliteGraphStore(fakeApp());
      await store.upsertNoteNode({ id: "source", title: "Source", path: "source.md" });
      await store.upsertNoteNode({ id: "target1", title: "Target 1", path: "target1.md" });
      await store.upsertNoteNode({ id: "target2", title: "Target 2", path: "target2.md" });

      await store.replaceOutgoingWikiLinks("source", ["target1", "target2"]);
      const neighbors = await store.fetchNeighbors(["source"], 1, 10);
      expect(neighbors.map((n) => n.id).sort()).toEqual(["target1", "target2"].sort());

      // Replace with only target2
      await store.replaceOutgoingWikiLinks("source", ["target2"]);
      const updated = await store.fetchNeighbors(["source"], 1, 10);
      expect(updated.map((n) => n.id)).toEqual(["target2"]);
    });

    it("preserves explicit LINKS_TO relations when replacing WikiLink edges", async () => {
      const store = new SqliteGraphStore(fakeApp());
      await store.upsertNoteNode({ id: "source", title: "Source", path: "source.md" });
      await store.upsertNoteNode({ id: "explicit_target", title: "Explicit Target", path: "explicit_target.md" });
      await store.upsertNoteNode({ id: "wikilink_target", title: "WikiLink Target", path: "wikilink_target.md" });

      // Explicit relation with custom label "LINKS_TO" saved via Relation Builder
      await store.upsertTypedEdges([
        {
          src: { id: "source", title: "Source", path: "source.md" },
          tgt: { id: "explicit_target", title: "Explicit Target", path: "explicit_target.md" },
          relType: "LINKS_TO",
          description: "explicit didactic link",
          bidirectional: false,
          originalTerm: "LINKS_TO",
        },
      ]);

      // WikiLink replace with wikilink_target
      await store.replaceOutgoingWikiLinks("source", ["wikilink_target"]);

      // Both explicit_target and wikilink_target must be neighbors
      const neighbors = await store.fetchNeighbors(["source"], 1, 10);
      expect(neighbors.map((n) => n.id).sort()).toEqual(["explicit_target", "wikilink_target"].sort());

      // Empty WikiLink replace should NOT drop explicit_target
      await store.replaceOutgoingWikiLinks("source", []);
      const remaining = await store.fetchNeighbors(["source"], 1, 10);
      expect(remaining.map((n) => n.id)).toEqual(["explicit_target"]);
    });

    it("preserves graph edges on case-only rename with identical canonical ID", async () => {
      const store = new SqliteGraphStore(fakeApp());
      await store.syncVaultGraph(
        [node("note"), node("b")],
        [{ src: "note", tgt: "b", type: "LINKS_TO" }]
      );

      // Case-only rename: note.md -> Note.md (pathToId returns "note" for both)
      const moved = await store.moveNote("note.md", "Note.md", "Note");
      expect(moved).toBe(true);

      const neighbors = await store.fetchNeighbors(["note"], 1, 10);
      expect(neighbors.map((n) => n.id)).toEqual(["b"]);
    });

    it("clears obsolete typed provenance during authoritative reconciliation so subsequent wikilink removal deletes edge", async () => {
      const app = fakeApp();
      const store = new SqliteGraphStore(app);
      await store.upsertNoteNode({ id: "a", title: "A", path: "a.md" });
      await store.upsertNoteNode({ id: "b", title: "B", path: "b.md" });

      // 1. Initial state: explicit relation with LINKS_TO
      await store.upsertTypedEdges([
        {
          src: { id: "a", title: "A", path: "a.md" },
          tgt: { id: "b", title: "B", path: "b.md" },
          relType: "LINKS_TO",
          description: "explicit didactic link",
          bidirectional: false,
          originalTerm: "LINKS_TO",
        },
      ]);

      // 2. Authoritative sync where explicit relation was deleted, leaving only a body WikiLink
      await store.syncVaultGraph(
        [node("a"), node("b")],
        [{ src: "a", tgt: "b", type: "LINKS_TO" }],
        { reconcileEdges: true }
      );

      // 3. Subsequently WikiLink is removed from body
      await store.replaceOutgoingWikiLinks("a", []);

      // Edge must now be deleted because authoritative sync cleared the obsolete typed provenance
      const neighbors = await store.fetchNeighbors(["a"], 1, 10);
      expect(neighbors.length).toBe(0);
    });
  });
});

