import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildToolbar, runCalcVectors } from "./toolbar";
import type { ScatterViewContext } from "../context";
import { fetchEmbedding } from "../../../llm/fetchEmbedding";
import { pathToId } from "../../../noteSlug";
import { getVectorStore } from "../../../sync/storeFactory";
import { buildEmbeddingInput } from "../../../sync/embeddingText";
import { syncVaultVectors } from "../../../sync/vaultVectorSync";
import type { VectorPoint, VectorStore } from "../../../sync/vectorStore";
import { TFile } from "obsidian";
import { DEFAULT_SETTINGS } from "../../../settings/defaults";

const DEFAULT_SETTINGS_FOR_TEST = { ...DEFAULT_SETTINGS, language: "en" };

if (typeof window === "undefined") {
  (globalThis as any).window = globalThis;
}

const noticeCalls: { message: string; duration?: number }[] = [];

vi.mock("obsidian", () => {
  return {
    Notice: class {
      constructor(message: string, duration?: number) {
        noticeCalls.push({ message, duration });
      }
    },
    setIcon: vi.fn(),
    TFile: class {
      path = "";
      basename = "";
    },
  };
});

vi.mock("../../../llm/fetchEmbedding", () => ({
  fetchEmbedding: vi.fn(),
}));

vi.mock("../../../sync/storeFactory", () => ({
  getVectorStore: vi.fn(),
}));

vi.mock("../../../settings/secrets", () => ({
  resolveEmbeddingApiKey: vi.fn(() => "test-api-key"),
}));

interface MockEl {
  text: string;
  classes: Set<string>;
  disabled?: boolean;
  setText(t: string): void;
  addClass(c: string): void;
  removeClass(...c: string[]): void;
}

/** Fake vault holding `files` (path -> raw markdown) - enough for the file reads runCalcVectors and syncVaultVectors perform. */
function createMockVault(files: Record<string, string>) {
  const tfiles = Object.keys(files).map((path) => {
    const f = new TFile();
    f.path = path;
    f.basename = path.replace(/^.*\//, "").replace(/\.md$/, "");
    (f as unknown as { name: string }).name = path.replace(/^.*\//, "");
    return f;
  });
  return {
    getAbstractFileByPath: (path: string) => tfiles.find((f) => f.path === path) ?? null,
    getMarkdownFiles: () => tfiles,
    cachedRead: async (f: TFile) => files[f.path],
  };
}

function createMockEl(): MockEl {
  const el: MockEl = {
    text: "",
    classes: new Set<string>(),
    setText(t: string) {
      this.text = t;
    },
    addClass(c: string) {
      this.classes.add(c);
    },
    removeClass(...classes: string[]) {
      for (const c of classes) {
        this.classes.delete(c);
      }
    },
  };
  return el;
}

describe("runCalcVectors persistence error reporting (#9)", () => {
  let mockBtn: HTMLButtonElement;
  let mockStatusText: HTMLElement;
  let mockHoverBar: HTMLElement;
  let mockCtx: ScatterViewContext;
  let mockSyncPoints: ReturnType<typeof vi.fn>;
  let mockReconcile: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    noticeCalls.length = 0;
    vi.clearAllMocks();

    mockBtn = createMockEl() as unknown as HTMLButtonElement;
    mockStatusText = createMockEl() as unknown as HTMLElement;
    mockHoverBar = createMockEl() as unknown as HTMLElement;

    mockSyncPoints = vi.fn().mockResolvedValue(undefined);
    mockReconcile = vi.fn().mockResolvedValue(undefined);

    vi.mocked(getVectorStore).mockReturnValue({
      syncPoints: mockSyncPoints,
      reconcile: mockReconcile,
      flush: vi.fn().mockResolvedValue(undefined),
      getStoredHashes: vi.fn().mockResolvedValue(new Map()),
      getVector: vi.fn().mockResolvedValue(null),
      getVectors: vi.fn().mockResolvedValue(new Map()),
    } as unknown as ReturnType<typeof getVectorStore>);

    vi.mocked(fetchEmbedding).mockResolvedValue({
      embedding: [0.1, 0.2, 0.3],
      error: null,
    });

    mockCtx = {
      app: { vault: createMockVault({ "note-1.md": "Content of note 1" }) } as any,
      settings: {
        embeddingMaxChars: 8000,
        embeddingModel: "bge-m3",
        embeddingApiBaseUrl: "http://localhost:11434/v1",
        language: "de",
      } as any,
      nodes: [
        {
          id: "note-1",
          path: "note-1.md",
          title: "Note 1",
          content: "Content of note 1",
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          connections: 0,
          folder: "",
        },
      ],
      scanVaultNotes: vi.fn().mockResolvedValue(undefined),
      applyLayout: vi.fn(),
      redraw: vi.fn(),
    } as unknown as ScatterViewContext;
  });

  it("reports success when SQLite sync succeeds", async () => {
    await runCalcVectors(mockCtx, mockBtn, mockStatusText, mockHoverBar);

    expect(mockSyncPoints).toHaveBeenCalledTimes(1);
    expect(mockSyncPoints).toHaveBeenCalledWith([
      expect.objectContaining({ id: pathToId("note-1.md"), payload: expect.objectContaining({ path: "note-1.md" }) }),
    ]);
    expect(mockReconcile).toHaveBeenCalledTimes(1);
    expect((mockStatusText as any).text).toContain("Vektoren OK");
    expect((mockHoverBar as any).text).toContain("[OK]");
    expect(noticeCalls.some((n) => n.message.includes("[OK]"))).toBe(true);
    expect(noticeCalls.some((n) => n.message.includes("[ERROR]"))).toBe(false);
  });

  it("reports localized success when SQLite sync succeeds in English", async () => {
    mockCtx.settings.language = "en";

    await runCalcVectors(mockCtx, mockBtn, mockStatusText, mockHoverBar);

    expect(mockSyncPoints).toHaveBeenCalledTimes(1);
    expect(mockReconcile).toHaveBeenCalledTimes(1);
    expect((mockStatusText as any).text).toBe("1 | Vectors OK");
    expect((mockHoverBar as any).text).toContain("note vectors calculated with 'bge-m3'");
    expect(noticeCalls.some((n) => n.message.includes("[OK] 1 note vectors calculated with 'bge-m3'"))).toBe(true);
    expect(noticeCalls.some((n) => n.message.includes("[ERROR]"))).toBe(false);
  });

  it("surfaces error notice and suppresses OK when SQLite persistence fails", async () => {
    mockSyncPoints.mockRejectedValueOnce(new Error("SQLite disk I/O error"));

    await runCalcVectors(mockCtx, mockBtn, mockStatusText, mockHoverBar);

    expect(mockSyncPoints).toHaveBeenCalledTimes(1);
    expect((mockStatusText as any).text).toBe("Speicherfehler");
    expect((mockHoverBar as any).classes.has("is-error")).toBe(true);
    expect((mockHoverBar as any).text).toContain("SQLite-Persistierungsfehler: SQLite disk I/O error");

    const errorNotice = noticeCalls.find((n) => n.message.includes("[ERROR] Vektoren berechnet, aber Persistierung in SQLite fehlgeschlagen"));
    expect(errorNotice).toBeDefined();
    expect(errorNotice?.message).toContain("SQLite disk I/O error");
    expect(errorNotice?.duration).toBe(8000);

    // Verify [OK] notice is NOT emitted
    expect(noticeCalls.some((n) => n.message.includes("[OK]"))).toBe(false);
    expect(mockCtx.applyLayout).not.toHaveBeenCalled();
    expect(mockCtx.redraw).not.toHaveBeenCalled();
  });

  it("surfaces localized error notice and suppresses OK when SQLite persistence fails in English", async () => {
    mockCtx.settings.language = "en";
    mockSyncPoints.mockRejectedValueOnce(new Error("Disk failure"));

    await runCalcVectors(mockCtx, mockBtn, mockStatusText, mockHoverBar);

    expect(mockSyncPoints).toHaveBeenCalledTimes(1);
    expect((mockStatusText as any).text).toBe("Storage error");
    expect((mockHoverBar as any).classes.has("is-error")).toBe(true);
    expect((mockHoverBar as any).text).toContain("SQLite persistence error: Disk failure");

    const errorNotice = noticeCalls.find((n) => n.message.includes("[ERROR] Vectors calculated, but SQLite persistence failed"));
    expect(errorNotice).toBeDefined();
    expect(errorNotice?.message).toContain("Disk failure");
    expect(errorNotice?.duration).toBe(8000);

    expect(noticeCalls.some((n) => n.message.includes("[OK]"))).toBe(false);
    expect(mockCtx.applyLayout).not.toHaveBeenCalled();
    expect(mockCtx.redraw).not.toHaveBeenCalled();
  });

  it("surfaces error notice when reconcile rejects even if syncPoints succeeded", async () => {
    mockReconcile.mockRejectedValueOnce(new Error("Reconcile error"));

    await runCalcVectors(mockCtx, mockBtn, mockStatusText, mockHoverBar);

    expect(mockSyncPoints).toHaveBeenCalledTimes(1);
    expect(mockReconcile).toHaveBeenCalledTimes(1);
    expect((mockStatusText as any).text).toBe("Speicherfehler");

    const errorNotice = noticeCalls.find((n) => n.message.includes("[ERROR] Vektoren berechnet, aber Persistierung in SQLite fehlgeschlagen"));
    expect(errorNotice).toBeDefined();
    expect(errorNotice?.message).toContain("Reconcile error");

    expect(noticeCalls.some((n) => n.message.includes("[OK]"))).toBe(false);
    expect(mockCtx.applyLayout).not.toHaveBeenCalled();
    expect(mockCtx.redraw).not.toHaveBeenCalled();
  });

  it("skips fetchEmbedding when note content hash matches stored hash", async () => {
    const expectedHash = buildEmbeddingInput("note-1", "Content of note 1", 8000).hash;

    const storedHashes = new Map<string, { hash: string }>();
    storedHashes.set("note-1.md", { hash: expectedHash });

    vi.mocked(getVectorStore).mockReturnValue({
      syncPoints: mockSyncPoints,
      reconcile: mockReconcile,
      flush: vi.fn().mockResolvedValue(undefined),
      getStoredHashes: vi.fn().mockResolvedValue(storedHashes),
      getVector: vi.fn().mockResolvedValue([0.9, 0.8, 0.7]),
      getVectors: vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, [0.9, 0.8, 0.7]]))),
    } as unknown as ReturnType<typeof getVectorStore>);

    await runCalcVectors(mockCtx, mockBtn, mockStatusText, mockHoverBar);

    // fetchEmbedding must NOT be called because it is cached
    expect(fetchEmbedding).not.toHaveBeenCalled();
    // Vector was hydrated from SQLite
    expect(mockCtx.nodes[0].embedding).toEqual([0.9, 0.8, 0.7]);
    // Status text indicates active cache
    expect((mockStatusText as any).text).toContain("Cache aktiv");
    expect((mockHoverBar as any).text).toContain("bereits im Cache");
    expect(mockCtx.applyLayout).toHaveBeenCalledTimes(1);
    expect(mockCtx.redraw).toHaveBeenCalledTimes(1);
  });
});

describe("runCalcVectors shares embedding text with the Settings vault sync (#161)", () => {
  const longBody = "Intro paragraph. " + "x".repeat(3000) + " tail only visible past 1500 chars";
  const files = {
    "Folder/Long Note.md": `---\ntitle: Display Title\n---\n${longBody}`,
    "Short.md": "Short body",
  };

  beforeEach(() => {
    noticeCalls.length = 0;
    vi.clearAllMocks();
    vi.mocked(fetchEmbedding).mockResolvedValue({ embedding: [0.1, 0.2, 0.3], error: null });
  });

  function createStore(): VectorStore {
    const rows = new Map<string, VectorPoint>();
    return {
      testConnection: async () => {},
      syncPoints: async (points: VectorPoint[]) => {
        for (const p of points) rows.set(p.payload.path, p);
      },
      search: async () => [],
      getVector: async (id: string) => rows.get(id)?.vector ?? null,
      getVectors: async (ids: string[]) => new Map(ids.filter((id) => rows.has(id)).map((id) => [id, rows.get(id)!.vector])),
      flush: async () => {},
      getStoredHashes: async () => new Map([...rows].map(([path, p]) => [path, { hash: p.contentHash! }])),
      reconcile: async () => ({ removed: 0 }),
    };
  }

  function createCtx(settings: Record<string, unknown>): ScatterViewContext {
    return {
      app: { vault: createMockVault(files) },
      settings,
      // node.title is the frontmatter title and node.content the 800-char scan excerpt;
      // neither may leak into the embedding text.
      nodes: [
        { id: pathToId("Folder/Long Note.md"), path: "Folder/Long Note.md", title: "Display Title", content: longBody.slice(0, 800), x: 0, y: 0 },
        { id: pathToId("Short.md"), path: "Short.md", title: "Short", content: "Short body", x: 0, y: 0 },
      ],
      scanVaultNotes: vi.fn(),
      applyLayout: vi.fn(),
      redraw: vi.fn(),
    } as unknown as ScatterViewContext;
  }

  it("yields 100% cache hits after a Settings vault sync", async () => {
    const settings = { ...DEFAULT_SETTINGS_FOR_TEST };
    const store = createStore();
    vi.mocked(getVectorStore).mockReturnValue(store as ReturnType<typeof getVectorStore>);

    const synced = await syncVaultVectors({ vault: createMockVault(files) } as any, settings as any, store);
    expect(synced.syncedCount).toBe(2);
    vi.mocked(fetchEmbedding).mockClear();

    await runCalcVectors(createCtx(settings), createMockEl() as any, createMockEl() as any, createMockEl() as any);

    expect(fetchEmbedding).not.toHaveBeenCalled();
    expect(noticeCalls.some((n) => n.message.includes("[OK] 2"))).toBe(true);
  });

  it("yields 100% cache hits for a Settings vault sync after the toolbar calculated the vectors", async () => {
    const settings = { ...DEFAULT_SETTINGS_FOR_TEST };
    const store = createStore();
    vi.mocked(getVectorStore).mockReturnValue(store as ReturnType<typeof getVectorStore>);

    await runCalcVectors(createCtx(settings), createMockEl() as any, createMockEl() as any, createMockEl() as any);
    expect(fetchEmbedding).toHaveBeenCalledTimes(2);
    vi.mocked(fetchEmbedding).mockClear();

    const synced = await syncVaultVectors({ vault: createMockVault(files) } as any, settings as any, store);

    expect(fetchEmbedding).not.toHaveBeenCalled();
    expect(synced.skippedCount).toBe(2);
  });

  it("embeds the file basename and body beyond the old 800/1500-char windows", async () => {
    vi.mocked(getVectorStore).mockReturnValue(createStore() as ReturnType<typeof getVectorStore>);

    await runCalcVectors(createCtx({ ...DEFAULT_SETTINGS_FOR_TEST }), createMockEl() as any, createMockEl() as any, createMockEl() as any);

    const sentText = vi.mocked(fetchEmbedding).mock.calls[0][0];
    expect(sentText.startsWith("Long Note\nIntro paragraph.")).toBe(true);
    expect(sentText).toContain("tail only visible past 1500 chars");
    expect(sentText).not.toContain("Display Title");
  });

  it("caps the embedded text at embeddingMaxChars", async () => {
    vi.mocked(getVectorStore).mockReturnValue(createStore() as ReturnType<typeof getVectorStore>);

    await runCalcVectors(createCtx({ ...DEFAULT_SETTINGS_FOR_TEST, embeddingMaxChars: 1000 }), createMockEl() as any, createMockEl() as any, createMockEl() as any);

    expect(vi.mocked(fetchEmbedding).mock.calls[0][0].length).toBe(1000);
  });
});

describe("runCalcVectors reconciles against the whole vault, not the filtered view (#165)", () => {
  beforeEach(() => {
    noticeCalls.length = 0;
    vi.clearAllMocks();
    vi.mocked(fetchEmbedding).mockResolvedValue({ embedding: [0.1, 0.2, 0.3], error: null });
  });

  it("keeps stored vectors of notes filtered out of the view", async () => {
    const stored = new Map<string, number[]>([
      ["Visible.md", [1, 0]],
      ["Hidden.md", [0, 1]],
      ["Deleted.md", [1, 1]],
    ]);
    vi.mocked(getVectorStore).mockReturnValue({
      flush: vi.fn().mockResolvedValue(undefined),
      getStoredHashes: vi.fn().mockResolvedValue(new Map()),
      getVector: vi.fn().mockResolvedValue(null),
      getVectors: vi.fn().mockResolvedValue(new Map()),
      syncPoints: vi.fn(async (points: VectorPoint[]) => {
        for (const p of points) stored.set(p.payload.path, p.vector);
      }),
      reconcile: vi.fn(async (paths: string[]) => {
        const keep = new Set(paths);
        for (const path of [...stored.keys()]) if (!keep.has(path)) stored.delete(path);
        return { removed: 0 };
      }),
    } as unknown as ReturnType<typeof getVectorStore>);

    // The view is filtered down to Visible.md; Hidden.md still exists in the vault, Deleted.md does not.
    const ctx = {
      app: { vault: createMockVault({ "Visible.md": "visible body", "Hidden.md": "hidden body" }) },
      settings: { ...DEFAULT_SETTINGS_FOR_TEST },
      nodes: [{ id: pathToId("Visible.md"), path: "Visible.md", title: "Visible", content: "visible body", x: 0, y: 0 }],
      scanVaultNotes: vi.fn(),
      applyLayout: vi.fn(),
      redraw: vi.fn(),
    } as unknown as ScatterViewContext;

    await runCalcVectors(ctx, createMockEl() as any, createMockEl() as any, createMockEl() as any);

    expect(stored.has("Hidden.md")).toBe(true);
    expect(stored.has("Visible.md")).toBe(true);
    expect(stored.has("Deleted.md")).toBe(false);
  });

  it("does not keep notes excluded from indexing", async () => {
    const reconcile = vi.fn().mockResolvedValue({ removed: 0 });
    vi.mocked(getVectorStore).mockReturnValue({
      flush: vi.fn().mockResolvedValue(undefined),
      getStoredHashes: vi.fn().mockResolvedValue(new Map()),
      getVector: vi.fn().mockResolvedValue(null),
      getVectors: vi.fn().mockResolvedValue(new Map()),
      syncPoints: vi.fn().mockResolvedValue(undefined),
      reconcile,
    } as unknown as ReturnType<typeof getVectorStore>);

    const ctx = {
      app: { vault: createMockVault({ "Visible.md": "a", "private/Secret.md": "b" }) },
      settings: { ...DEFAULT_SETTINGS_FOR_TEST, vectorSearchExclusions: "-path:private" },
      nodes: [{ id: pathToId("Visible.md"), path: "Visible.md", title: "Visible", content: "a", x: 0, y: 0 }],
      scanVaultNotes: vi.fn(),
      applyLayout: vi.fn(),
      redraw: vi.fn(),
    } as unknown as ScatterViewContext;

    await runCalcVectors(ctx, createMockEl() as any, createMockEl() as any, createMockEl() as any);

    expect(reconcile).toHaveBeenCalledWith(["Visible.md"]);
  });
});

describe("runCalcVectors persists pending changes before reporting success (#166)", () => {
  beforeEach(() => {
    noticeCalls.length = 0;
    vi.clearAllMocks();
  });

  function cachedCtx(): ScatterViewContext {
    return {
      app: { vault: createMockVault({ "note-1.md": "Content of note 1" }) },
      settings: { ...DEFAULT_SETTINGS_FOR_TEST },
      nodes: [{ id: pathToId("note-1.md"), path: "note-1.md", title: "Note 1", content: "", x: 0, y: 0, embedding: [0.5, 0.5] }],
      scanVaultNotes: vi.fn(),
      applyLayout: vi.fn(),
      redraw: vi.fn(),
    } as unknown as ScatterViewContext;
  }

  function storeWithAllCached(flush: ReturnType<typeof vi.fn>) {
    const hash = buildEmbeddingInput("note-1", "Content of note 1", DEFAULT_SETTINGS_FOR_TEST.embeddingMaxChars).hash;
    vi.mocked(getVectorStore).mockReturnValue({
      getStoredHashes: vi.fn().mockResolvedValue(new Map([["note-1.md", { hash }]])),
      getVector: vi.fn().mockResolvedValue([0.5, 0.5]),
      getVectors: vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, [0.5, 0.5]]))),
      syncPoints: vi.fn().mockResolvedValue(undefined),
      reconcile: vi.fn().mockResolvedValue({ removed: 0 }),
      flush,
    } as unknown as ReturnType<typeof getVectorStore>);
  }

  it("flushes even when every note was a cache hit", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    storeWithAllCached(flush);

    await runCalcVectors(cachedCtx(), createMockEl() as any, createMockEl() as any, createMockEl() as any);

    expect(fetchEmbedding).not.toHaveBeenCalled();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(noticeCalls.some((n) => n.message.includes("[OK]"))).toBe(true);
  });

  it("reports a persistence error instead of cached success when the pending write fails again", async () => {
    storeWithAllCached(vi.fn().mockRejectedValue(new Error("disk still full")));
    const btn = createMockEl() as any;
    const statusText = createMockEl() as any;

    await runCalcVectors(cachedCtx(), btn, statusText, createMockEl() as any);

    expect(noticeCalls.some((n) => n.message.includes("[OK]"))).toBe(false);
    expect(noticeCalls.some((n) => n.message.includes("[ERROR]") && n.message.includes("disk still full"))).toBe(true);
    expect(statusText.text).toBe("Storage error");
  });
});

describe("runCalcVectors survives a live rescan and always re-enables the button (#169)", () => {
  const vaultFiles = { "A.md": "a body", "B.md": "b body", "C.md": "c body" };
  const node = (path: string) => ({ id: pathToId(path), path, title: path, content: "", x: 0, y: 0 });

  beforeEach(() => {
    noticeCalls.length = 0;
    vi.clearAllMocks();
    vi.mocked(getVectorStore).mockReturnValue({
      getStoredHashes: vi.fn().mockResolvedValue(new Map()),
      getVector: vi.fn().mockResolvedValue(null),
      getVectors: vi.fn().mockResolvedValue(new Map()),
      syncPoints: vi.fn().mockResolvedValue(undefined),
      reconcile: vi.fn().mockResolvedValue({ removed: 0 }),
      flush: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof getVectorStore>);
  });

  it("finishes when the watcher replaces ctx.nodes with a shorter list mid-run", async () => {
    const ctx = {
      app: { vault: createMockVault(vaultFiles) },
      settings: { ...DEFAULT_SETTINGS_FOR_TEST },
      nodes: [node("A.md"), node("B.md"), node("C.md")],
      scanVaultNotes: vi.fn(),
      applyLayout: vi.fn(),
      redraw: vi.fn(),
    } as unknown as ScatterViewContext;
    const rescanned = [node("A.md")];
    vi.mocked(fetchEmbedding).mockImplementation(async (text: string) => {
      // Simulates triggerVaultRescan firing while the first request is in flight.
      ctx.nodes = rescanned as typeof ctx.nodes;
      return { embedding: [text.length, 1], error: null };
    });
    const btn = createMockEl() as any;

    await runCalcVectors(ctx, btn, createMockEl() as any, createMockEl() as any);

    expect(fetchEmbedding).toHaveBeenCalledTimes(3);
    expect(btn.disabled).toBe(false);
    expect(noticeCalls.some((n) => n.message.includes("[ERROR]"))).toBe(false);
    // The rescanned node object receives the vector computed for its path.
    expect(rescanned[0]).toHaveProperty("embedding", [buildEmbeddingInput("A", "a body", 8000).text.length, 1]);
  });

  it("re-enables the button and reports the error when the run throws unexpectedly", async () => {
    const vault = createMockVault(vaultFiles);
    vault.cachedRead = async () => {
      throw new Error("read failed");
    };
    const ctx = {
      app: { vault },
      settings: { ...DEFAULT_SETTINGS_FOR_TEST },
      nodes: [node("A.md")],
      scanVaultNotes: vi.fn(),
      applyLayout: vi.fn(),
      redraw: vi.fn(),
    } as unknown as ScatterViewContext;
    const btn = createMockEl() as any;
    const hoverBar = createMockEl() as any;

    await runCalcVectors(ctx, btn, createMockEl() as any, hoverBar);

    expect(btn.disabled).toBe(false);
    expect(hoverBar.text).toContain("read failed");
    expect(noticeCalls.some((n) => n.message.includes("[ERROR]") && n.message.includes("read failed"))).toBe(true);
  });
});

describe("runCalcVectors does not count notes deleted since the scan", () => {
  beforeEach(() => {
    noticeCalls.length = 0;
    vi.clearAllMocks();
  });

  it("reports only the notes that still exist as cached, and still completes", async () => {
    const hash = buildEmbeddingInput("Kept", "kept body", DEFAULT_SETTINGS_FOR_TEST.embeddingMaxChars).hash;
    const reconcile = vi.fn().mockResolvedValue({ removed: 0 });
    vi.mocked(getVectorStore).mockReturnValue({
      getStoredHashes: vi.fn().mockResolvedValue(new Map([["Kept.md", { hash }]])),
      getVector: vi.fn().mockResolvedValue([0.5, 0.5]),
      getVectors: vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, [0.5, 0.5]]))),
      syncPoints: vi.fn().mockResolvedValue(undefined),
      reconcile,
      flush: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof getVectorStore>);
    const statusText = createMockEl() as any;
    const ctx = {
      // Gone.md is still in the scanned node list but no longer in the vault.
      app: { vault: createMockVault({ "Kept.md": "kept body" }) },
      settings: { ...DEFAULT_SETTINGS_FOR_TEST },
      nodes: [
        { id: pathToId("Kept.md"), path: "Kept.md", title: "Kept", content: "", x: 0, y: 0 },
        { id: pathToId("Gone.md"), path: "Gone.md", title: "Gone", content: "", x: 0, y: 0 },
      ],
      scanVaultNotes: vi.fn(),
      applyLayout: vi.fn(),
      redraw: vi.fn(),
    } as unknown as ScatterViewContext;

    await runCalcVectors(ctx, createMockEl() as any, statusText, createMockEl() as any);

    expect(noticeCalls).toHaveLength(1);
    expect(noticeCalls[0].message.startsWith("[OK] 1 ")).toBe(true);
    expect(statusText.text.startsWith("1 | ")).toBe(true);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(fetchEmbedding).not.toHaveBeenCalled();
  });
});

describe("runCalcVectors replaces stale in-memory vectors on cache hits (#175)", () => {
  it("takes the stored vector although the node already holds one", async () => {
    noticeCalls.length = 0;
    vi.clearAllMocks();
    const hash = buildEmbeddingInput("A", "a body", DEFAULT_SETTINGS_FOR_TEST.embeddingMaxChars).hash;
    vi.mocked(getVectorStore).mockReturnValue({
      getStoredHashes: vi.fn().mockResolvedValue(new Map([["A.md", { hash }]])),
      getVectors: vi.fn().mockResolvedValue(new Map([["A.md", [1, 0, 0]]])),
      syncPoints: vi.fn().mockResolvedValue(undefined),
      reconcile: vi.fn().mockResolvedValue({ removed: 0 }),
      flush: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof getVectorStore>);
    const node = { id: pathToId("A.md"), path: "A.md", title: "A", content: "", x: 0, y: 0, embedding: [0, 9, 9, 9] };
    const ctx = {
      app: { vault: createMockVault({ "A.md": "a body" }) },
      settings: { ...DEFAULT_SETTINGS_FOR_TEST },
      nodes: [node],
      scanVaultNotes: vi.fn(),
      applyLayout: vi.fn(),
      redraw: vi.fn(),
    } as unknown as ScatterViewContext;

    await runCalcVectors(ctx, createMockEl() as any, createMockEl() as any, createMockEl() as any);

    expect(fetchEmbedding).not.toHaveBeenCalled();
    expect(ctx.nodes[0].embedding).toEqual([1, 0, 0]);
  });
});

describe("runCalcVectors discards its vectors when the embedding target changes mid-run (#202)", () => {
  const vaultFiles = { "A.md": "a body", "B.md": "b body", "C.md": "c body" };
  const node = (path: string) => ({ id: pathToId(path), path, title: path, content: "", x: 0, y: 0, embedding: [7, 7] });
  let store: { syncPoints: ReturnType<typeof vi.fn>; reconcile: ReturnType<typeof vi.fn>; flush: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    noticeCalls.length = 0;
    vi.clearAllMocks();
    store = {
      syncPoints: vi.fn().mockResolvedValue(undefined),
      reconcile: vi.fn().mockResolvedValue({ removed: 0 }),
      flush: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(getVectorStore).mockReturnValue({
      getStoredHashes: vi.fn().mockResolvedValue(new Map()),
      getVectors: vi.fn().mockResolvedValue(new Map()),
      ...store,
    } as unknown as ReturnType<typeof getVectorStore>);
  });

  function createCtx(): ScatterViewContext {
    return {
      app: { vault: createMockVault(vaultFiles) },
      settings: { ...DEFAULT_SETTINGS_FOR_TEST, embeddingModel: "model-a" },
      nodes: [node("A.md"), node("B.md"), node("C.md")],
      scanVaultNotes: vi.fn(),
      applyLayout: vi.fn(),
      redraw: vi.fn(),
    } as unknown as ScatterViewContext;
  }

  it("stops requesting, keeps the view's vectors and writes nothing when the model switches during a request", async () => {
    const ctx = createCtx();
    vi.mocked(fetchEmbedding).mockImplementation(async () => {
      ctx.settings.embeddingModel = "model-b";
      return { embedding: [1, 0], error: null };
    });
    const hoverBar = createMockEl() as any;

    await runCalcVectors(ctx, createMockEl() as any, createMockEl() as any, hoverBar);

    expect(fetchEmbedding).toHaveBeenCalledTimes(1);
    expect(ctx.nodes.map((n) => n.embedding)).toEqual([[7, 7], [7, 7], [7, 7]]);
    expect(store.syncPoints).not.toHaveBeenCalled();
    expect(store.reconcile).not.toHaveBeenCalled();
    expect(store.flush).not.toHaveBeenCalled();
    expect(ctx.applyLayout).not.toHaveBeenCalled();
    expect(hoverBar.text.startsWith("[WARN]")).toBe(true);
    expect(noticeCalls.some((n) => n.message.startsWith("[WARN]"))).toBe(true);
    expect(noticeCalls.some((n) => n.message.startsWith("[OK]"))).toBe(false);
  });

  it("discards the results when the endpoint switches during the last request", async () => {
    const ctx = createCtx();
    let calls = 0;
    vi.mocked(fetchEmbedding).mockImplementation(async () => {
      if (++calls === 3) ctx.settings.embeddingApiBaseUrl = "http://other-host:1234/v1";
      return { embedding: [1, 0], error: null };
    });

    await runCalcVectors(ctx, createMockEl() as any, createMockEl() as any, createMockEl() as any);

    expect(fetchEmbedding).toHaveBeenCalledTimes(3);
    expect(ctx.nodes.map((n) => n.embedding)).toEqual([[7, 7], [7, 7], [7, 7]]);
    expect(store.syncPoints).not.toHaveBeenCalled();
  });

  it("finishes normally when a setting unrelated to the embedding target changes mid-run", async () => {
    const ctx = createCtx();
    vi.mocked(fetchEmbedding).mockImplementation(async () => {
      ctx.settings.language = "de";
      return { embedding: [1, 0], error: null };
    });

    await runCalcVectors(ctx, createMockEl() as any, createMockEl() as any, createMockEl() as any);

    expect(fetchEmbedding).toHaveBeenCalledTimes(3);
    expect(ctx.nodes.map((n) => n.embedding)).toEqual([[1, 0], [1, 0], [1, 0]]);
    expect(store.syncPoints).toHaveBeenCalledTimes(1);
    expect(ctx.applyLayout).toHaveBeenCalled();
  });

  it("does not write vectors into the view's nodes before the run is verified", async () => {
    const ctx = createCtx();
    const seen: (number[] | undefined)[] = [];
    vi.mocked(fetchEmbedding).mockImplementation(async () => {
      seen.push(ctx.nodes[0].embedding);
      return { embedding: [1, 0], error: null };
    });

    await runCalcVectors(ctx, createMockEl() as any, createMockEl() as any, createMockEl() as any);

    expect(seen).toEqual([[7, 7], [7, 7], [7, 7]]);
  });
});

describe("buildToolbar edgeHops persistence", () => {
  it("persists scatterEdgeHops to settings on dropdown change and exposes updateEdgeHops handle", async () => {
    const { getTranslation } = await import("../../../i18n");
    const t = getTranslation("de");

    const createdSelects: any[] = [];

    function createMockDiv(): any {
      const el: any = {
        addClass: vi.fn(),
        removeClass: vi.fn(),
        toggleClass: vi.fn(),
        setText: vi.fn(),
        setAttribute: vi.fn(),
        createDiv: vi.fn(() => createMockDiv()),
        createSpan: vi.fn(() => createMockDiv()),
        createEl: vi.fn((tag: string) => {
          if (tag === "select") {
            const sel: any = {
              value: "1",
              onchange: null,
              createEl: vi.fn(() => ({ selected: false })),
            };
            createdSelects.push(sel);
            return sel;
          }
          return createMockDiv();
        }),
      };
      return el;
    }

    const mockCtx = {
      edgeHops: 1,
      settings: {
        scatterEdgeHops: 1,
      },
      saveSettings: vi.fn().mockResolvedValue(undefined),
      applyLayout: vi.fn(),
      redraw: vi.fn(),
      nodes: [],
      selectedNodeIds: new Set(),
      fitToView: vi.fn(),
      openRelationBuilder: vi.fn(),
      searchNote: vi.fn(),
    } as any;

    const refs = {
      canvasWrap: createMockDiv(),
      canvas: createMockDiv(),
      toolbarEl: createMockDiv(),
      hoverBar: createMockDiv(),
    };

    const handles = buildToolbar(mockCtx, refs, t);
    expect(handles.updateEdgeHops).toBeDefined();

    // createdSelects[0] is the edge hops dropdown in Ansicht section
    const edgeHopsSelect = createdSelects[0];
    expect(edgeHopsSelect).toBeDefined();

    // Trigger onchange on select
    edgeHopsSelect.value = "2";
    edgeHopsSelect.onchange();

    expect(mockCtx.edgeHops).toBe(2);
    expect(mockCtx.settings.scatterEdgeHops).toBe(2);
    expect(mockCtx.saveSettings).toHaveBeenCalledTimes(1);
    expect(mockCtx.redraw).toHaveBeenCalled();

    // Now test handles.updateEdgeHops
    handles.updateEdgeHops!(3);
    expect(edgeHopsSelect.value).toBe("3");
  });
});

describe("buildToolbar rearrange action (#214)", () => {
  it("places a rearrange button in the view section that triggers a free relayout", async () => {
    const { getTranslation } = await import("../../../i18n");
    const t = getTranslation("de");
    const buttons: any[] = [];
    function createMockDiv(): any {
      return {
        addClass: vi.fn(),
        removeClass: vi.fn(),
        toggleClass: vi.fn(),
        setText: vi.fn(),
        setAttribute: vi.fn(),
        createDiv: vi.fn(() => createMockDiv()),
        createSpan: vi.fn(() => createMockDiv()),
        createEl: vi.fn((tag: string, opts?: { text?: string }) => {
          const el = { ...createMockDiv(), value: "1", text: opts?.text, onclick: null as null | (() => void) };
          if (tag === "button") buttons.push(el);
          return el;
        }),
      };
    }
    const ctx = {
      edgeHops: 1,
      settings: { scatterEdgeHops: 1 },
      saveSettings: vi.fn(),
      applyLayout: vi.fn(),
      rearrangeLayout: vi.fn().mockResolvedValue(undefined),
      redraw: vi.fn(),
      nodes: [],
      selectedNodeIds: new Set(),
      fitToView: vi.fn(),
    } as any;

    buildToolbar(ctx, { canvasWrap: createMockDiv(), canvas: createMockDiv(), toolbarEl: createMockDiv(), hoverBar: createMockDiv() }, t);

    const rearrange = buttons.find((b) => b.text === t.btnRearrangeLayout);
    expect(rearrange).toBeDefined();
    rearrange.onclick();
    expect(ctx.rearrangeLayout).toHaveBeenCalledTimes(1);
    expect(ctx.applyLayout).not.toHaveBeenCalled();
  });
});
