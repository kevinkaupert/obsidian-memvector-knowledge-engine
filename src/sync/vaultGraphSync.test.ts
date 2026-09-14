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
    const { nodes, edges } = extractVaultGraph(app);

    const alpha = nodes.find((n) => n.path === "Alpha.md")!;
    const homeOverview = nodes.find((n) => n.path === "Home/Overview.md")!;
    const workOverview = nodes.find((n) => n.path === "Work/Overview.md")!;

    const edge = edges.find((e) => e.src === alpha.id);
    expect(edge?.tgt).toBe(homeOverview.id);
    expect(edge?.tgt).not.toBe(workOverview.id);
  });

  it("falls back to a slug of the raw link text for a dangling (unresolvable) link", () => {
    const app = fakeApp([{ path: "Alpha.md", basename: "Alpha", links: ["Does Not Exist"] }]);
    const { edges } = extractVaultGraph(app);

    expect(edges).toHaveLength(1);
    expect(edges[0].tgt).toBe("does-not-exist");
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

    await syncVaultGraph(app, store);
    expect((await store.fetchNeighbors(["a"], 1, 10)).map((n) => n.id)).toEqual(["b"]);

    // b.md is deleted from the vault (same running app instance, no reload).
    files.splice(files.findIndex((f) => f.path === "b.md"), 1);
    await syncVaultGraph(app, store);

    expect(await store.fetchNeighbors(["a"], 1, 10)).toEqual([]);
  });
});
