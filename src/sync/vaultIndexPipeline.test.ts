import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { TFile, type App, type Component } from "obsidian";

vi.mock("obsidian", () => ({
  requestUrl: vi.fn(),
  TFile: class {},
  Component: class {
    registerEvent = vi.fn();
  },
}));

vi.mock("../llm/fetchEmbedding", () => ({
  fetchEmbedding: vi.fn(async (text: string) => ({
    embedding: [0.1, 0.2, 0.3],
  })),
}));

import { DEFAULT_SETTINGS } from "../settings/defaults";
import type { MemVectorSettings } from "../settings/types";
import { VaultIndexingPipeline } from "./vaultIndexPipeline";
import type { PendingVaultChanges } from "../views/vectorScatter/vaultEventQueue";
import { fetchEmbedding } from "../llm/fetchEmbedding";
import { getVectorStore, getGraphStore } from "./storeFactory";
import { getStoredNodePositions, saveNodePositions } from "./sqlite/nodePositions";
import { pathToId } from "../noteSlug";
import { closeLocalDb, getLocalDb } from "./sqlite/sqliteDb";
import { SqliteGraphStore } from "./sqlite/sqliteGraphStore";
import { enableNoteKeyCache, noteKeys } from "../noteKey";

interface FakeFile {
  path: string;
  name: string;
  basename: string;
  extension: string;
  stat?: { mtime: number };
}

function fakeApp(vaultFiles: Map<string, string> = new Map()): {
  app: App;
  callbacks: Map<string, Function>;
  fire: (event: string, ...args: unknown[]) => void;
  files: Map<string, string>;
} {
  const configDir = ".obsidian";
  const wasmPath = `${configDir}/plugins/memvector-knowledge-engine/sql-wasm.wasm`;
  const binaryFiles = new Map<string, ArrayBuffer>();

  const wasmBytes = readFileSync(resolve(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm"));
  binaryFiles.set(wasmPath, wasmBytes.buffer.slice(wasmBytes.byteOffset, wasmBytes.byteOffset + wasmBytes.byteLength));

  const callbacks = new Map<string, Function>();

  const toFile = (path: string): TFile => {
    const isMd = path.endsWith(".md");
    return Object.assign(new TFile(), {
      path,
      name: path.split("/").pop() || path,
      basename: (path.split("/").pop() || path).replace(/\.[^.]+$/, ""),
      extension: isMd ? "md" : (path.split(".").pop() || ""),
      stat: { mtime: 1000 },
    });
  };

  const app = {
    vault: {
      configDir,
      adapter: {
        exists: async (p: string) => binaryFiles.has(p),
        readBinary: async (p: string) => {
          const buf = binaryFiles.get(p);
          if (!buf) throw new Error(`fakeApp: not found ${p}`);
          return buf;
        },
        writeBinary: async (p: string, data: ArrayBuffer) => {
          binaryFiles.set(p, data);
        },
      },
      getMarkdownFiles: () => Array.from(vaultFiles.keys()).map(toFile),
      getAbstractFileByPath: (p: string) => (vaultFiles.has(p) ? toFile(p) : null),
      cachedRead: vi.fn(async (f: { path: string }) => vaultFiles.get(f.path) ?? ""),
      on: vi.fn((event: string, cb: Function) => {
        callbacks.set(event, cb);
        return { event, cb };
      }),
    },
    metadataCache: {
      getFileCache: vi.fn((f: { path: string }) => ({
        frontmatter: {},
        links: [],
      })),
      getFirstLinkpathDest: vi.fn(),
      on: vi.fn((event: string, cb: Function) => {
        callbacks.set(`meta:${event}`, cb);
        return { event, cb };
      }),
    },
    secretStorage: {
      getSecret: vi.fn(() => "test-api-key"),
    },
  } as unknown as App;

  const fire = (event: string, ...args: unknown[]) => {
    callbacks.get(event)?.(...args);
  };

  return { app, callbacks, fire, files: vaultFiles };
}

function createTestTimers(): {
  timers: { setTimeout: (fn: () => void, ms: number) => number; clearTimeout: (id: number) => void };
  advanceTime: (ms: number) => Promise<void>;
} {
  let currentTime = 0;
  let nextId = 1;
  const tasks: Array<{ id: number; due: number; fn: () => void }> = [];

  const timers = {
    setTimeout: (fn: () => void, ms: number): number => {
      const id = nextId++;
      tasks.push({ id, due: currentTime + ms, fn });
      return id;
    },
    clearTimeout: (id: number): void => {
      const idx = tasks.findIndex((t) => t.id === id);
      if (idx !== -1) tasks.splice(idx, 1);
    },
  };

  const advanceTime = async (ms: number): Promise<void> => {
    currentTime += ms;
    const runnable = tasks.filter((t) => t.due <= currentTime);
    for (const t of runnable) {
      const idx = tasks.indexOf(t);
      if (idx !== -1) tasks.splice(idx, 1);
      t.fn();
    }
    // Settle async work
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setImmediate(r));
    }
  };

  return { timers, advanceTime };
}

describe("VaultIndexingPipeline (Issue #250)", () => {
  beforeEach(() => {
    vi.mocked(fetchEmbedding).mockClear();
  });

  afterEach(async () => {
    await closeLocalDb();
  });

  it("DoD 1: A note created while the scatter view is closed is embedded and in the graph after the debounce window", async () => {
    const { app, fire, files } = fakeApp();
    files.set("concepts/quantum.md", "# Quantum Computing\nSuperposition and entanglement.");

    const settings: MemVectorSettings = {
      ...DEFAULT_SETTINGS,
      autoIndexVaultOnChanges: true,
    };

    const { timers, advanceTime } = createTestTimers();
    const pipeline = new VaultIndexingPipeline(app, () => settings, timers);
    const mockComponent: Component = { registerEvent: vi.fn() } as unknown as Component;
    pipeline.registerWatchers(mockComponent);

    // Fire file create event while scatter view is closed
    fire("create", { path: "concepts/quantum.md" });

    // Advance past debounce window (800ms) and settle async pipeline work
    await advanceTime(1000);
    await pipeline.settle();

    // 1. fetchEmbedding should have been called for quantum.md
    expect(fetchEmbedding).toHaveBeenCalledTimes(1);

    // 2. Vector store should contain quantum.md embedding
    const vectorStore = getVectorStore(app, settings);
    const vector = await vectorStore.getVector("concepts/quantum.md");
    expect(vector).toEqual([0.1, 0.2, 0.3]);

    // 3. Graph store should contain the note in the graph
    const graphStore = getGraphStore(app, settings);
    const isIndexed = await graphStore.isIndexed?.();
    expect(isIndexed).toBe(true);

    pipeline.dispose();
  });

  it("keeps the previous owner's rows when a rename hands it a duplicated id (#279)", async () => {
    const U = "01J9Z8Q4M5N6P7R8S9T0V1W2X3";
    const { app, fire, files } = fakeApp();
    files.set("a.md", "# A");
    files.set("z.md", "# Z");
    vi.mocked(app.metadataCache.getFileCache).mockImplementation(
      (f: { path: string }) => ({ frontmatter: { id: U }, links: [] }) as never
    );
    const settings: MemVectorSettings = { ...DEFAULT_SETTINGS, autoIndexVaultOnChanges: true };
    enableNoteKeyCache(app);
    expect(noteKeys(app).keyOf("a.md")).toBe(U); // a.md sorts first and owns U

    const vectorStore = getVectorStore(app, settings);
    await vectorStore.syncPoints([
      { id: U, vector: [1, 1, 1], payload: { path: "a.md", title: "a", content: "A" }, contentHash: "ha", mtime: 1000 },
      { id: pathToId("z.md"), vector: [2, 2, 2], payload: { path: "z.md", title: "z", content: "Z" }, contentHash: "hz", mtime: 1000 },
    ]);
    await saveNodePositions(app, [
      { id: U, path: "a.md", x: 10, y: 10 },
      { id: pathToId("z.md"), path: "z.md", x: 90, y: 90 },
    ]);
    vi.mocked(fetchEmbedding).mockClear();

    const { timers, advanceTime } = createTestTimers();
    const pipeline = new VaultIndexingPipeline(app, () => settings, timers);
    pipeline.registerWatchers({ registerEvent: vi.fn() } as unknown as Component);

    // z.md becomes 0.md, which now sorts first and takes U from a.md
    files.delete("z.md");
    files.set("0.md", "# Z");
    fire("rename", { path: "0.md" }, "z.md");
    await advanceTime(1000);
    await pipeline.settle();

    expect(noteKeys(app).keyOf("0.md")).toBe(U);
    expect(await vectorStore.getVector("a.md")).toEqual([1, 1, 1]);
    expect(await vectorStore.getVector("0.md")).toEqual([2, 2, 2]);
    const positions = await getStoredNodePositions(app, [pathToId("a.md"), U]);
    expect(positions.get(pathToId("a.md"))).toEqual({ x: 10, y: 10 });
    expect(positions.get(U)).toEqual({ x: 90, y: 90 });
    expect(fetchEmbedding).not.toHaveBeenCalled();
    pipeline.dispose();
  });

  it("tells open views to re-read every note of a duplicated id (#279)", async () => {
    const U = "01J9Z8Q4M5N6P7R8S9T0V1W2X3";
    const { app, fire, files } = fakeApp();
    files.set("a.md", "# A");
    files.set("z.md", "# Z");
    vi.mocked(app.metadataCache.getFileCache).mockImplementation(
      (f: { path: string }) => ({ frontmatter: { id: U }, links: [] }) as never
    );
    enableNoteKeyCache(app);
    const settings: MemVectorSettings = { ...DEFAULT_SETTINGS, autoIndexVaultOnChanges: false };
    const { timers, advanceTime } = createTestTimers();
    const pipeline = new VaultIndexingPipeline(app, () => settings, timers);
    pipeline.registerWatchers({ registerEvent: vi.fn() } as unknown as Component);
    const seen: PendingVaultChanges[] = [];
    pipeline.subscribe((c) => seen.push(c));

    fire("modify", { path: "a.md" });
    await advanceTime(1000);

    expect([...seen[0].upserts].sort()).toEqual(["a.md", "z.md"]);
    pipeline.dispose();
  });

  it("DoD 2: Renames move existing vectors and positions instead of re-embedding", async () => {
    const { app, fire, files } = fakeApp();
    files.set("concepts/original.md", "# Original Content");

    const settings: MemVectorSettings = {
      ...DEFAULT_SETTINGS,
      autoIndexVaultOnChanges: true,
    };

    // Pre-populate vector store and positions table for original.md
    const vectorStore = getVectorStore(app, settings);
    await vectorStore.syncPoints([
      {
        id: pathToId("concepts/original.md"),
        vector: [0.9, 0.8, 0.7],
        payload: { path: "concepts/original.md", title: "original", content: "Original Content" },
        contentHash: "d83b4b88",
        mtime: 1000,
      },
    ]);
    await saveNodePositions(app, [
      { id: pathToId("concepts/original.md"), path: "concepts/original.md", x: 250, y: -300 },
    ]);

    const graphStore = getGraphStore(app, settings);
    await graphStore.upsertNoteNode?.({
      id: pathToId("concepts/original.md"),
      title: "original",
      path: "concepts/original.md",
    });

    vi.mocked(fetchEmbedding).mockClear();

    const { timers, advanceTime } = createTestTimers();
    const pipeline = new VaultIndexingPipeline(app, () => settings, timers);
    const mockComponent: Component = { registerEvent: vi.fn() } as unknown as Component;
    pipeline.registerWatchers(mockComponent);

    // Rename file in vault
    files.delete("concepts/original.md");
    files.set("concepts/renamed.md", "# Original Content");

    fire("rename", { path: "concepts/renamed.md" }, "concepts/original.md");
    await advanceTime(1000);
    await pipeline.settle();

    // ZERO embedding calls!
    expect(fetchEmbedding).not.toHaveBeenCalled();

    // Vector was moved to renamed.md
    expect(await vectorStore.getVector("concepts/original.md")).toBeNull();
    expect(await vectorStore.getVector("concepts/renamed.md")).toEqual([0.9, 0.8, 0.7]);

    // Position was moved to renamed.md
    const newPos = await getStoredNodePositions(app, [pathToId("concepts/renamed.md"), "concepts/renamed.md"]);
    expect(newPos.get("concepts/renamed.md")).toEqual({ x: 250, y: -300 });

    pipeline.dispose();
  });

  it("bounds embedding costs: content hash match skips re-embedding", async () => {
    const { app, fire, files } = fakeApp();
    files.set("note.md", "static content");

    const settings: MemVectorSettings = {
      ...DEFAULT_SETTINGS,
      autoIndexVaultOnChanges: true,
    };

    const { timers, advanceTime } = createTestTimers();
    const pipeline = new VaultIndexingPipeline(app, () => settings, timers);
    const mockComponent: Component = { registerEvent: vi.fn() } as unknown as Component;
    pipeline.registerWatchers(mockComponent);

    // Initial create
    fire("create", { path: "note.md" });
    await advanceTime(1000);
    await pipeline.settle();
    expect(fetchEmbedding).toHaveBeenCalledTimes(1);

    vi.mocked(fetchEmbedding).mockClear();

    // Modify event with identical content
    fire("modify", { path: "note.md" });
    await advanceTime(1000);
    await pipeline.settle();

    // Hash matches -> skipped!
    expect(fetchEmbedding).not.toHaveBeenCalled();

    pipeline.dispose();
  });

  it("respects exclusions: excluded paths are skipped", async () => {
    const { app, fire, files } = fakeApp();
    files.set("archive/ignored.md", "excluded content");

    const settings: MemVectorSettings = {
      ...DEFAULT_SETTINGS,
      vectorSearchExclusions: "-path:archive",
      autoIndexVaultOnChanges: true,
    };

    const { timers, advanceTime } = createTestTimers();
    const pipeline = new VaultIndexingPipeline(app, () => settings, timers);
    const mockComponent: Component = { registerEvent: vi.fn() } as unknown as Component;
    pipeline.registerWatchers(mockComponent);

    fire("create", { path: "archive/ignored.md" });
    await advanceTime(1000);
    await pipeline.settle();

    expect(fetchEmbedding).not.toHaveBeenCalled();
    const vectorStore = getVectorStore(app, settings);
    expect(await vectorStore.getVector("archive/ignored.md")).toBeNull();

    pipeline.dispose();
  });

  it("removes vector, position, and graph node on delete", async () => {
    const { app, fire, files } = fakeApp();
    files.set("del.md", "to be deleted");

    const settings: MemVectorSettings = {
      ...DEFAULT_SETTINGS,
      autoIndexVaultOnChanges: true,
    };

    const vectorStore = getVectorStore(app, settings);
    await vectorStore.syncPoints([
      {
        id: pathToId("del.md"),
        vector: [1, 2],
        payload: { path: "del.md", title: "del", content: "to be deleted" },
      },
    ]);
    await saveNodePositions(app, [{ id: pathToId("del.md"), path: "del.md", x: 10, y: 20 }]);

    const { timers, advanceTime } = createTestTimers();
    const pipeline = new VaultIndexingPipeline(app, () => settings, timers);
    const mockComponent: Component = { registerEvent: vi.fn() } as unknown as Component;
    pipeline.registerWatchers(mockComponent);

    files.delete("del.md");
    fire("delete", { path: "del.md" });
    await advanceTime(1000);
    await pipeline.settle();

    expect(await vectorStore.getVector("del.md")).toBeNull();
    const pos = await getStoredNodePositions(app, [pathToId("del.md"), "del.md"]);
    expect(pos.has("del.md")).toBe(false);

    pipeline.dispose();
  });

  it("does not index in the background when autoIndexVaultOnChanges is false (opt-in)", async () => {
    const { app, fire, files } = fakeApp();
    files.set("note.md", "content");

    const settings: MemVectorSettings = {
      ...DEFAULT_SETTINGS,
      autoIndexVaultOnChanges: false,
    };

    const { timers, advanceTime } = createTestTimers();
    const pipeline = new VaultIndexingPipeline(app, () => settings, timers);
    const mockComponent: Component = { registerEvent: vi.fn() } as unknown as Component;
    pipeline.registerWatchers(mockComponent);

    fire("create", { path: "note.md" });
    await advanceTime(1000);
    await pipeline.settle();

    expect(fetchEmbedding).not.toHaveBeenCalled();
    pipeline.dispose();
  });

  it("notifies open view subscribers with debounced changes batch", async () => {
    const { app, fire, files } = fakeApp();
    files.set("note.md", "content");

    const settings: MemVectorSettings = {
      ...DEFAULT_SETTINGS,
      autoIndexVaultOnChanges: false,
    };

    const { timers, advanceTime } = createTestTimers();
    const pipeline = new VaultIndexingPipeline(app, () => settings, timers);
    const received: string[] = [];
    const unsubscribe = pipeline.subscribe((changes) => {
      received.push(...Array.from(changes.upserts));
    });

    const mockComponent: Component = { registerEvent: vi.fn() } as unknown as Component;
    pipeline.registerWatchers(mockComponent);

    fire("create", { path: "note.md" });
    await advanceTime(1000);
    await pipeline.settle();

    expect(received).toEqual(["note.md"]);

    unsubscribe();
    pipeline.dispose();
  });

  it("embeds a renamed note when there is no existing vector to move", async () => {
    const { app, fire, files } = fakeApp();
    const settings: MemVectorSettings = {
      ...DEFAULT_SETTINGS,
      autoIndexVaultOnChanges: true,
      embeddingModel: "bge-m3",
    };

    const vectorStore = getVectorStore(app, settings);
    vi.mocked(fetchEmbedding).mockClear();

    const { timers, advanceTime } = createTestTimers();
    const pipeline = new VaultIndexingPipeline(app, () => settings, timers);
    const mockComponent: Component = { registerEvent: vi.fn() } as unknown as Component;
    pipeline.registerWatchers(mockComponent);

    // Note was never previously indexed
    files.set("new_path.md", "# Freshly Renamed Content");

    fire("rename", { path: "new_path.md" }, "unindexed_old.md");
    await advanceTime(1000);
    await pipeline.settle();

    // Since no existing vector could be moved, normal upsert embeds it
    expect(fetchEmbedding).toHaveBeenCalledTimes(1);
    expect(await vectorStore.getVector("new_path.md")).toEqual([0.1, 0.2, 0.3]);

    pipeline.dispose();
  });

  it("treats renames away from Markdown as deletions", async () => {
    const { app, fire, files } = fakeApp();
    const settings: MemVectorSettings = {
      ...DEFAULT_SETTINGS,
      autoIndexVaultOnChanges: true,
      embeddingModel: "bge-m3",
    };

    const vectorStore = getVectorStore(app, settings);
    await vectorStore.syncPoints([
      {
        id: pathToId("note.md"),
        vector: [0.9, 0.8, 0.7],
        payload: { path: "note.md", title: "note", content: "hello" },
        contentHash: "hash-1",
      },
    ]);
    await saveNodePositions(app, [
      { id: pathToId("note.md"), path: "note.md", x: 100, y: 200 },
    ]);

    const graphStore = getGraphStore(app, settings);
    await graphStore.upsertNoteNode?.({
      id: pathToId("note.md"),
      title: "note",
      path: "note.md",
    });

    const { timers, advanceTime } = createTestTimers();
    const pipeline = new VaultIndexingPipeline(app, () => settings, timers);
    const mockComponent: Component = { registerEvent: vi.fn() } as unknown as Component;
    pipeline.registerWatchers(mockComponent);

    files.delete("note.md");
    files.set("note.txt", "not markdown anymore");

    fire("rename", { path: "note.txt" }, "note.md");
    await advanceTime(1000);
    await pipeline.settle();

    // Old vector and position must be removed
    expect(await vectorStore.getVector("note.md")).toBeNull();
    expect(await vectorStore.getVector("note.txt")).toBeNull();
    const pos = await getStoredNodePositions(app, ["note.md", "note.txt"]);
    expect(pos.size).toBe(0);

    pipeline.dispose();
  });

  it("detects removal of previously indexed frontmatter links", async () => {
    const { app, fire, files } = fakeApp();
    const settings: MemVectorSettings = {
      ...DEFAULT_SETTINGS,
      autoIndexVaultOnChanges: false,
    };

    const { timers, advanceTime } = createTestTimers();
    const pipeline = new VaultIndexingPipeline(app, () => settings, timers);

    let relationsReloadCount = 0;
    pipeline.subscribe((changes) => {
      if (changes.relations) relationsReloadCount++;
    });

    const mockComponent: Component = { registerEvent: vi.fn() } as unknown as Component;
    pipeline.registerWatchers(mockComponent);

    files.set("linked.md", "---\nREQUIRES: '[[other]]'\n---\n# Note");

    // 1. Initial metadataCache event with frontmatter link
    fire("meta:changed", { path: "linked.md" }, "", {
      frontmatter: { REQUIRES: "[[other]]" },
    });
    await advanceTime(500);
    expect(relationsReloadCount).toBe(1);

    // 2. Frontmatter link removed - cache has empty frontmatter
    fire("meta:changed", { path: "linked.md" }, "", {
      frontmatter: {},
    });
    await advanceTime(500);
    // Reload must be triggered again because the note previously had links
    expect(relationsReloadCount).toBe(2);

    pipeline.dispose();
  });

  it("preserves modifications coalesced with a rename", async () => {
    const { app, fire, files } = fakeApp();
    const settings: MemVectorSettings = {
      ...DEFAULT_SETTINGS,
      autoIndexVaultOnChanges: true,
      embeddingModel: "bge-m3",
    };

    const vectorStore = getVectorStore(app, settings);
    await vectorStore.syncPoints([
      {
        id: pathToId("concepts/original.md"),
        vector: [0.9, 0.8, 0.7],
        payload: { path: "concepts/original.md", title: "original", content: "old text" },
        contentHash: "old-hash",
      },
    ]);

    vi.mocked(fetchEmbedding).mockClear();

    const { timers, advanceTime } = createTestTimers();
    const pipeline = new VaultIndexingPipeline(app, () => settings, timers);
    const mockComponent: Component = { registerEvent: vi.fn() } as unknown as Component;
    pipeline.registerWatchers(mockComponent);

    // Edit and rename within the debounce window
    files.set("concepts/original.md", "# Modified Content Before Rename");
    fire("modify", { path: "concepts/original.md" });

    files.delete("concepts/original.md");
    files.set("concepts/renamed.md", "# Modified Content Before Rename");
    fire("rename", { path: "concepts/renamed.md" }, "concepts/original.md");

    await advanceTime(1000);
    await pipeline.settle();

    // Must NOT be dropped: fetchEmbedding must be called for the modified content
    expect(fetchEmbedding).toHaveBeenCalledTimes(1);

    pipeline.dispose();
  });

  it("remembers relation notes outside the relations folder and reloads relations on delete", async () => {
    const { app, fire, files } = fakeApp();
    const settings: MemVectorSettings = {
      ...DEFAULT_SETTINGS,
      autoIndexVaultOnChanges: false,
    };

    const { timers, advanceTime } = createTestTimers();
    const pipeline = new VaultIndexingPipeline(app, () => settings, timers);

    let relationsReloadCount = 0;
    pipeline.subscribe((changes) => {
      if (changes.relations) relationsReloadCount++;
    });

    const mockComponent: Component = { registerEvent: vi.fn() } as unknown as Component;
    pipeline.registerWatchers(mockComponent);

    // Relation note outside the configured relations folder (identified by type: relation)
    files.set("custom/rel.md", "---\ntype: relation\n---");
    vi.mocked(app.metadataCache.getFileCache).mockReturnValue({
      frontmatter: { type: "relation" },
      links: [],
    });

    // 1. Create relation note
    fire("create", app.vault.getAbstractFileByPath("custom/rel.md")!);
    await advanceTime(500);
    expect(relationsReloadCount).toBe(1);

    // 2. Delete relation note (on delete, cachedFrontmatterType is undefined)
    files.delete("custom/rel.md");
    vi.mocked(app.metadataCache.getFileCache).mockReturnValue(null);

    fire("delete", { path: "custom/rel.md" });
    await advanceTime(500);

    // Must trigger relation reload again because pipeline remembered it was a relation note
    expect(relationsReloadCount).toBe(2);

    pipeline.dispose();
  });

  it("updates graph store note record on pure rename without re-embedding", async () => {
    const { app, fire, files } = fakeApp();
    const settings: MemVectorSettings = {
      ...DEFAULT_SETTINGS,
      autoIndexVaultOnChanges: true,
      embeddingModel: "bge-m3",
    };

    const vectorStore = getVectorStore(app, settings);
    await vectorStore.syncPoints([
      {
        id: pathToId("old_name.md"),
        vector: [0.9, 0.8, 0.7],
        payload: { path: "old_name.md", title: "old_name", content: "hello world" },
        contentHash: "hash-same",
      },
    ]);

    vi.mocked(fetchEmbedding).mockClear();

    const { timers, advanceTime } = createTestTimers();
    const pipeline = new VaultIndexingPipeline(app, () => settings, timers);
    const mockComponent: Component = { registerEvent: vi.fn() } as unknown as Component;
    pipeline.registerWatchers(mockComponent);

    files.set("new_name.md", "hello world");
    files.delete("old_name.md");

    fire("rename", { path: "new_name.md" }, "old_name.md");
    await advanceTime(1000);
    await pipeline.settle();

    // fetchEmbedding was NOT called because vector was moved and content was not modified
    expect(fetchEmbedding).not.toHaveBeenCalled();

    // graphStore must have the upserted note for new_name in SQLite
    const db = await getLocalDb(app);
    const rows = db.exec("SELECT title, path FROM notes WHERE path = 'new_name.md'");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].values[0]).toEqual(["new_name", "new_name.md"]);

    pipeline.dispose();
  });

  it("restores incoming wikilinks when a target note is created, but not on modify", async () => {
    const { app, fire, files } = fakeApp();
    const settings: MemVectorSettings = {
      ...DEFAULT_SETTINGS,
      autoIndexVaultOnChanges: true,
      includeWikiLinksAsRelations: true,
      embeddingModel: "bge-m3",
    };

    const replaceSpy = vi.spyOn(SqliteGraphStore.prototype, "replaceOutgoingWikiLinks");

    const { timers, advanceTime } = createTestTimers();
    const pipeline = new VaultIndexingPipeline(app, () => settings, timers);
    const mockComponent: Component = { registerEvent: vi.fn() } as unknown as Component;
    pipeline.registerWatchers(mockComponent);

    // Setup: existing note source.md that links to target.md
    files.set("source.md", "Link to [[target]]");
    vi.mocked(app.metadataCache.getFileCache).mockImplementation((f: { path: string }) => {
      if (f.path === "source.md") {
        return {
          frontmatter: {},
          links: [{ link: "target", original: "[[target]]" }] as any,
        };
      }
      return { frontmatter: {}, links: [] };
    });

    replaceSpy.mockClear();

    // Modify source.md
    fire("modify", { path: "source.md" });
    await advanceTime(1000);
    await pipeline.settle();

    // On modify of source.md, replaceOutgoingWikiLinks is only called for source.md itself (outgoing)
    // and NOT for other files (incoming scan skipped)
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy).toHaveBeenCalledWith(pathToId("source.md"), expect.any(Array));

    replaceSpy.mockClear();

    // Now create target.md
    files.set("target.md", "I am target note");
    // Mock resolvedLinks so source.md points to target.md
    (app.metadataCache as any).resolvedLinks = {
      "source.md": { "target.md": 1 },
    };

    fire("create", { path: "target.md" });
    await advanceTime(1000);
    await pipeline.settle();

    // On create of target.md:
    // 1) target.md outgoing links updated
    // 2) source.md incoming link to target.md restored!
    expect(replaceSpy).toHaveBeenCalledWith(pathToId("target.md"), expect.any(Array));
    expect(replaceSpy).toHaveBeenCalledWith(pathToId("source.md"), expect.any(Array));

    replaceSpy.mockRestore();
    pipeline.dispose();
  });

  it("resynchronizes relations when a rename brings an excluded note back into the index", async () => {
    const { app, fire, files } = fakeApp();
    const settings: MemVectorSettings = {
      ...DEFAULT_SETTINGS,
      autoIndexVaultOnChanges: false,
      vectorSearchExclusions: "-path:archive",
    };

    const { timers, advanceTime } = createTestTimers();
    const pipeline = new VaultIndexingPipeline(app, () => settings, timers);

    let relationsReloadCount = 0;
    pipeline.subscribe((changes) => {
      if (changes.relations) relationsReloadCount++;
    });

    const mockComponent: Component = { registerEvent: vi.fn() } as unknown as Component;
    pipeline.registerWatchers(mockComponent);

    files.set("archive/note.md", "content");

    // Move from excluded archive/ to included notes/
    files.delete("archive/note.md");
    files.set("notes/note.md", "content");

    fire("rename", { path: "notes/note.md" }, "archive/note.md");
    await advanceTime(500);

    // Relations reload must be triggered because note crossed the exclusion boundary back into index
    expect(relationsReloadCount).toBe(1);

    pipeline.dispose();
  });

  it("delivers view updates immediately without waiting for embedding requests, followed by fresh vector notification", async () => {
    const { app, fire, files } = fakeApp();
    const settings: MemVectorSettings = {
      ...DEFAULT_SETTINGS,
      autoIndexVaultOnChanges: true,
      embeddingModel: "bge-m3",
    };

    let resolveEmbedding: (val: any) => void;
    const embeddingPromise = new Promise((resolve) => {
      resolveEmbedding = resolve;
    });
    vi.mocked(fetchEmbedding).mockImplementationOnce(() => embeddingPromise as any);

    const { timers, advanceTime } = createTestTimers();
    const pipeline = new VaultIndexingPipeline(app, () => settings, timers);

    const batches: PendingVaultChanges[] = [];
    pipeline.subscribe((changes) => {
      batches.push(changes);
    });

    const mockComponent: Component = { registerEvent: vi.fn() } as unknown as Component;
    pipeline.registerWatchers(mockComponent);

    files.set("slow.md", "some text");
    fire("create", { path: "slow.md" });

    // Advance time past the debounce
    await advanceTime(1000);

    // 1. Immediately delivered view update: views see "slow.md" right away without waiting for network
    expect(batches.length).toBe(1);
    expect(batches[0].upserts.has("slow.md")).toBe(true);

    // Now resolve the background embedding request
    resolveEmbedding!({ embedding: [0.1, 0.2, 0.3] });
    await pipeline.settle();

    // 2. Secondary notification delivered once fresh vectors are in SQLite
    expect(batches.length).toBe(2);
    expect(batches[1].upserts.has("slow.md")).toBe(true);

    pipeline.dispose();
  });

  it("delivers a post-index refresh for full scans once background indexing finishes", async () => {
    const { app, files } = fakeApp();
    const settings: MemVectorSettings = {
      ...DEFAULT_SETTINGS,
      autoIndexVaultOnChanges: true,
      embeddingModel: "bge-m3",
    };

    files.set("note.md", "content");

    const { timers, advanceTime } = createTestTimers();
    const pipeline = new VaultIndexingPipeline(app, () => settings, timers);

    const fullScansReceived: boolean[] = [];
    pipeline.subscribe((changes) => {
      if (changes.fullScan) fullScansReceived.push(true);
    });

    pipeline.triggerVaultRescan(); // Requests full scan
    await advanceTime(1000);
    await pipeline.settle();

    // Both initial notification and post-index refresh delivered
    expect(fullScansReceived.length).toBe(2);

    pipeline.dispose();
  });

  it("aborts queued background indexing when autoIndexVaultOnChanges is turned off", async () => {
    const { app, fire, files } = fakeApp();
    let enabled = true;
    const settings: MemVectorSettings = {
      ...DEFAULT_SETTINGS,
      autoIndexVaultOnChanges: true,
      embeddingModel: "bge-m3",
    };

    let resolveFirstEmbedding: (val: any) => void;
    const firstPromise = new Promise((resolve) => {
      resolveFirstEmbedding = resolve;
    });

    vi.mocked(fetchEmbedding).mockClear();
    vi.mocked(fetchEmbedding)
      .mockImplementationOnce(() => firstPromise as any)
      .mockImplementation(async () => ({ embedding: [0.1, 0.2, 0.3], error: null }));

    const { timers, advanceTime } = createTestTimers();
    const pipeline = new VaultIndexingPipeline(app, () => ({ ...settings, autoIndexVaultOnChanges: enabled }), timers);
    const mockComponent: Component = { registerEvent: vi.fn() } as unknown as Component;
    pipeline.registerWatchers(mockComponent);

    files.set("note1.md", "content 1");
    files.set("note2.md", "content 2");

    // Queue note1
    fire("create", { path: "note1.md" });
    await advanceTime(1000); // Debounce fires, note1 starts embedding (hung on firstPromise)

    // While note1 is embedding in the background, user disables automatic indexing
    enabled = false;

    // And note2 arrives
    fire("create", { path: "note2.md" });
    await advanceTime(1000); // Note2 queued in runExclusive

    // Resolve note1 embedding
    resolveFirstEmbedding!({ embedding: [0.1, 0.2, 0.3] });
    await pipeline.settle();

    // fetchEmbedding must have been called only once for note1, and NEVER for note2
    expect(fetchEmbedding).toHaveBeenCalledTimes(1);

    pipeline.dispose();
  });

  it("cancels active background full scan when autoIndexVaultOnChanges is disabled mid-scan", async () => {
    const { app, files } = fakeApp();
    let enabled = true;
    const settings: MemVectorSettings = {
      ...DEFAULT_SETTINGS,
      autoIndexVaultOnChanges: true,
      embeddingModel: "bge-m3",
    };

    files.set("scan1.md", "content scan 1");
    files.set("scan2.md", "content scan 2");
    files.set("scan3.md", "content scan 3");

    let resolveFirstEmbedding: (val: any) => void;
    const firstPromise = new Promise((resolve) => {
      resolveFirstEmbedding = resolve;
    });

    vi.mocked(fetchEmbedding).mockClear();
    vi.mocked(fetchEmbedding)
      .mockImplementationOnce(() => firstPromise as any)
      .mockImplementation(async () => ({ embedding: [0.1, 0.2, 0.3], error: null }));

    const { timers, advanceTime } = createTestTimers();
    const pipeline = new VaultIndexingPipeline(app, () => ({ ...settings, autoIndexVaultOnChanges: enabled }), timers);

    pipeline.triggerVaultRescan();
    await advanceTime(1000); // Debounce fires, full scan starts, first embedding hangs

    // Disable autoIndexVaultOnChanges while the scan is running
    enabled = false;

    // Resolve first embedding
    resolveFirstEmbedding!({ embedding: [0.1, 0.2, 0.3], error: null });
    await pipeline.settle();

    // Since it was cancelled, subsequent notes in the full scan should not have been embedded
    expect(fetchEmbedding).toHaveBeenCalledTimes(1);

    pipeline.dispose();
  });
});
