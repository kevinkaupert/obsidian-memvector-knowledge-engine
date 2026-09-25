import { readFileSync } from "fs";
import { resolve } from "path";
import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { SqliteGraphStore } from "./sqlite/sqliteGraphStore";
import { extractVaultGraph, syncVaultGraph } from "./vaultGraphSync";

interface FakeFile {
  path: string;
  basename: string;
  links?: string[];
}

/**
 * Minimal fake of just the vault.getMarkdownFiles/metadataCache surface
 * extractVaultGraph needs. getFirstLinkpathDest mimics Obsidian's own
 * link-resolution API (exact path match, falling back to unique basename)
 * rather than the plugin string-guessing at a raw link string itself.
 * `files` is read live on every call (like the real vault.getMarkdownFiles),
 * so a test can mutate the array in place to simulate a file being deleted
 * between two syncs within the same running app instance.
 */
function fakeApp(files: FakeFile[]): App {
  const toTFile = (f: FakeFile) => ({ path: f.path, basename: f.basename, name: `${f.basename}.md` });

  return {
    vault: {
      getMarkdownFiles: () => files.map(toTFile),
    },
    metadataCache: {
      getFileCache: (file: { path: string }) => {
        const src = files.find((f) => f.path === file.path);
        return src?.links ? { links: src.links.map((l) => ({ link: l })) } : undefined;
      },
      getFirstLinkpathDest: (linktext: string) => {
        const normalized = linktext.replace(/\.md$/i, "");
        const byPath = files.find((f) => f.path.replace(/\.md$/i, "") === normalized);
        if (byPath) return toTFile(byPath);
        const byBasename = files.find((f) => f.basename === normalized);
        return byBasename ? toTFile(byBasename) : null;
      },
    },
  } as unknown as App;
}

/** Same as fakeApp, plus a real sql.js-backed vault.adapter so SqliteGraphStore can persist. No relation files, so loadRelationEdges always resolves empty. */
function fakeAppWithStore(files: FakeFile[], diskFiles: Map<string, ArrayBuffer> = new Map()): App {
  const app = fakeApp(files) as unknown as { vault: Record<string, unknown> };
  const configDir = ".obsidian";
  const wasmPath = `${configDir}/plugins/memvector-knowledge-engine/sql-wasm.wasm`;
  if (!diskFiles.has(wasmPath)) {
    const wasmBytes = readFileSync(resolve(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm"));
    diskFiles.set(wasmPath, wasmBytes.buffer.slice(wasmBytes.byteOffset, wasmBytes.byteOffset + wasmBytes.byteLength));
  }
  app.vault.configDir = configDir;
  app.vault.adapter = {
    exists: async (path: string) => diskFiles.has(path),
    readBinary: async (path: string) => {
      const buf = diskFiles.get(path);
      if (!buf) throw new Error(`fakeApp: no such file ${path}`);
      return buf;
    },
    writeBinary: async (path: string, data: ArrayBuffer) => {
      diskFiles.set(path, data);
    },
  };
  return app as unknown as App;
}

describe("extractVaultGraph", () => {
  it("gives same-basename notes in different folders distinct node ids (F04b)", () => {
    const app = fakeApp([
      { path: "Work/Overview.md", basename: "Overview" },
      { path: "Home/Overview.md", basename: "Overview" },
    ]);
    const { nodes } = extractVaultGraph(app);

    expect(nodes).toHaveLength(2);
    const ids = new Set(nodes.map((n) => n.id));
    expect(ids.size).toBe(2);
  });

  it("resolves a WikiLink to the exact target file via Obsidian's own API, not a basename guess (F04a groundwork)", () => {
    const app = fakeApp([
      { path: "Work/Overview.md", basename: "Overview" },
      { path: "Home/Overview.md", basename: "Overview" },
      { path: "Alpha.md", basename: "Alpha", links: ["Home/Overview"] },
    ]);
    const { nodes, edges } = extractVaultGraph(app, undefined, true);

    const alpha = nodes.find((n) => n.path === "Alpha.md")!;
    const homeOverview = nodes.find((n) => n.path === "Home/Overview.md")!;
    const workOverview = nodes.find((n) => n.path === "Work/Overview.md")!;

    const edge = edges.find((e) => e.src === alpha.id);
    expect(edge?.tgt).toBe(homeOverview.id);
    expect(edge?.tgt).not.toBe(workOverview.id);
  });

  it("falls back to a slug of the raw link text for a dangling (unresolvable) link", () => {
    const app = fakeApp([{ path: "Alpha.md", basename: "Alpha", links: ["Does Not Exist"] }]);
    const { edges } = extractVaultGraph(app, undefined, true);

    expect(edges).toHaveLength(1);
    expect(edges[0].tgt).toBe("does-not-exist");
  });

  it("omits WikiLink LINKS_TO edges by default (Issue #100)", () => {
    const app = fakeApp([
      { path: "a.md", basename: "a", links: ["b"] },
      { path: "b.md", basename: "b" },
    ]);
    const { nodes, edges } = extractVaultGraph(app);

    expect(nodes).toHaveLength(2);
    expect(edges).toEqual([]);
  });

  it("omits WikiLink LINKS_TO edges when the toggle is explicitly off (Issue #100)", () => {
    const app = fakeApp([
      { path: "a.md", basename: "a", links: ["b", "Does Not Exist"] },
      { path: "b.md", basename: "b" },
    ]);
    const { nodes, edges } = extractVaultGraph(app, undefined, false);

    expect(nodes).toHaveLength(2);
    expect(edges).toEqual([]);
  });

  it("still extracts nodes (not edges) for linked and unlinked notes when the toggle is off (Issue #100)", () => {
    const app = fakeApp([
      { path: "linked.md", basename: "linked", links: ["target"] },
      { path: "target.md", basename: "target" },
      { path: "orphan.md", basename: "orphan" },
    ]);
    const { nodes, edges } = extractVaultGraph(app);

    expect(nodes.map((n) => n.path).sort()).toEqual(["linked.md", "orphan.md", "target.md"]);
    expect(edges).toEqual([]);
  });
});

describe("syncVaultGraph (F03: full-vault re-index reconciliation)", () => {
  it("removes a deleted note and its edge from the graph store on the next full sync", async () => {
    const files: FakeFile[] = [
      { path: "a.md", basename: "a", links: ["b"] },
      { path: "b.md", basename: "b" },
    ];
    const app = fakeAppWithStore(files);
    const store = new SqliteGraphStore(app);

    await syncVaultGraph(app, store, undefined, true);
    expect((await store.fetchNeighbors(["a"], 1, 10)).map((n) => n.id)).toEqual(["b"]);

    // b.md is deleted from the vault (same running app instance, no reload).
    files.splice(files.findIndex((f) => f.path === "b.md"), 1);
    await syncVaultGraph(app, store, undefined, true);

    expect(await store.fetchNeighbors(["a"], 1, 10)).toEqual([]);
  });

  it("respects exclusions query and omits excluded files and their edges (F03)", async () => {
    const files: FakeFile[] = [
      { path: "wiki/concept.md", basename: "concept", links: ["meta/log"] },
      { path: "meta/log.md", basename: "log" },
    ];
    const app = fakeAppWithStore(files);
    const store = new SqliteGraphStore(app);

    await syncVaultGraph(app, store, "-path:meta", true);
    const neighbors = await store.fetchNeighbors(["wiki/concept"], 1, 10);
    expect(neighbors).toEqual([]);
  });

  it("clears graph store completely when all files are deleted or excluded (F03)", async () => {
    const files: FakeFile[] = [
      { path: "a.md", basename: "a", links: ["b"] },
      { path: "b.md", basename: "b" },
    ];
    const app = fakeAppWithStore(files);
    const store = new SqliteGraphStore(app);

    await syncVaultGraph(app, store, undefined, true);
    expect((await store.fetchNeighbors(["a"], 1, 10)).map((n) => n.id)).toEqual(["b"]);

    // All files removed from vault
    files.length = 0;
    const res = await syncVaultGraph(app, store, undefined, true);
    expect(res.nodeCount).toBe(0);
    expect(res.edgeCount).toBe(0);
    expect(await store.fetchNeighbors(["a"], 1, 10)).toEqual([]);
  });

  it("indexes no WikiLink neighbors when includeWikiLinksAsRelations is off (Issue #100)", async () => {
    const files: FakeFile[] = [
      { path: "a.md", basename: "a", links: ["b"] },
      { path: "b.md", basename: "b" },
    ];
    const app = fakeAppWithStore(files);
    const store = new SqliteGraphStore(app);

    await syncVaultGraph(app, store);
    expect(await store.fetchNeighbors(["a"], 1, 10)).toEqual([]);
  });

  it("removes previously indexed WikiLink edges once the toggle is turned off (Issue #100)", async () => {
    const files: FakeFile[] = [
      { path: "a.md", basename: "a", links: ["b"] },
      { path: "b.md", basename: "b" },
    ];
    const app = fakeAppWithStore(files);
    const store = new SqliteGraphStore(app);

    await syncVaultGraph(app, store, undefined, true);
    expect((await store.fetchNeighbors(["a"], 1, 10)).map((n) => n.id)).toEqual(["b"]);

    await syncVaultGraph(app, store, undefined, false);
    expect(await store.fetchNeighbors(["a"], 1, 10)).toEqual([]);
  });
});

