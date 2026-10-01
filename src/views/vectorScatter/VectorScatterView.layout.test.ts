import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TFile, type WorkspaceLeaf } from "obsidian";
import { VectorScatterView, type VectorScatterHost } from "./VectorScatterView";
import { DEFAULT_SETTINGS } from "../../settings/defaults";
import { applyGraphVectorProjection } from "./layout/projections";
import { getStoredNodePositions, saveNodePositions } from "../../sync/sqlite/nodePositions";
import type { RelationEdge } from "./types";
import { loadRelationEdges } from "./relationEdges";

/**
 * Harness for the view's scan -> layout -> persist path with the real layout code. Only Obsidian, rendering,
 * the vector store and the position table are faked. Simulation runs are counted by wrapping the real
 * applyGraphVectorProjection, position writes by the in-memory position table.
 */

if (typeof window === "undefined") {
  (globalThis as any).window = globalThis;
}

vi.mock("obsidian", () => ({
  ItemView: class {
    containerEl = { isShown: () => true };
    addAction = vi.fn();
    registerEvent = vi.fn();
    getState(): Record<string, unknown> {
      return {};
    }
    async setState(_state: unknown, _result: unknown): Promise<void> {}
  },
  Modal: class {},
  Notice: class {},
  TFile: class {},
  setIcon: vi.fn(),
}));

vi.mock("./toolbar/toolbar", () => ({
  buildToolbar: vi.fn(() => ({ statusText: {}, updateSelectionUI: vi.fn(), updateEdgeHops: vi.fn() })),
}));
vi.mock("./canvasInteraction", () => ({ wireCanvasInteraction: vi.fn(() => vi.fn()) }));
vi.mock("./rendering/drawOrchestrator", () => ({ draw: vi.fn() }));

vi.mock("./layout/projections", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./layout/projections")>();
  return { ...mod, applyGraphVectorProjection: vi.fn(mod.applyGraphVectorProjection) };
});

let relationEdges: RelationEdge[] = [];
vi.mock("./relationEdges", () => ({
  loadRelationEdges: vi.fn(async () => relationEdges),
}));

vi.mock("../../relationVocabulary/loadRelationVocabulary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../relationVocabulary/loadRelationVocabulary")>()),
  loadRelationVocabulary: vi.fn(async () => []),
}));

const storedPositions = new Map<string, { x: number; y: number }>();
vi.mock("../../sync/sqlite/nodePositions", () => ({
  getStoredNodePositions: vi.fn(async (_app: unknown, keys: string[]) => {
    const out = new Map<string, { x: number; y: number }>();
    for (const k of keys) {
      const p = storedPositions.get(k);
      if (p) out.set(k, { ...p });
    }
    return out;
  }),
  saveNodePositions: vi.fn(async (_app: unknown, records: { id: string; path?: string; x: number; y: number }[]) => {
    for (const r of records) {
      storedPositions.set(r.id, { x: r.x, y: r.y });
      if (r.path) storedPositions.set(r.path, { x: r.x, y: r.y });
    }
  }),
}));

const vectors = new Map<string, number[]>();
vi.mock("../../sync/storeFactory", () => ({
  getVectorStore: vi.fn(() => ({
    getVectors: vi.fn(async (keys: string[]) => {
      const out = new Map<string, number[]>();
      for (const k of keys) {
        const v = vectors.get(k);
        if (v) out.set(k, v);
      }
      return out;
    }),
  })),
}));

interface FakeNote {
  path: string;
  content: string;
}

/** Fake vault over a mutable note list; vault.on callbacks are captured so tests can fire events. */
function createFixture(notes: FakeNote[]) {
  const callbacks = new Map<string, (...args: any[]) => void>();
  const toFile = (n: FakeNote) =>
    Object.assign(new TFile(), {
      path: n.path,
      basename: n.path.replace(/^.*\//, "").replace(/\.md$/, ""),
      name: n.path.replace(/^.*\//, ""),
      extension: "md",
    });
  const app = {
    vault: {
      getMarkdownFiles: () => notes.map(toFile),
      cachedRead: vi.fn(async (f: { path: string }) => notes.find((n) => n.path === f.path)?.content ?? ""),
      read: async (f: { path: string }) => notes.find((n) => n.path === f.path)?.content ?? "",
      getAbstractFileByPath: (p: string) => {
        const n = notes.find((x) => x.path === p);
        return n ? toFile(n) : null;
      },
      on: vi.fn((event: string, cb: (...args: any[]) => void) => (callbacks.set(event, cb), { event, cb })),
    },
    metadataCache: { getFileCache: () => undefined },
  };
  const host: VectorScatterHost = {
    app: app as any,
    settings: { ...DEFAULT_SETTINGS },
    saveSettings: vi.fn(async () => {}),
    focusSidebarNote: vi.fn(),
  };
  const view = new VectorScatterView({} as WorkspaceLeaf, host);
  const fire = (event: string, ...args: unknown[]) => callbacks.get(event)!(...args);
  return { view, notes, fire, toFile, vault: app.vault };
}

/** Six notes in two topic folders, each with a deterministic vector. */
function sixNotes(): FakeNote[] {
  const notes: FakeNote[] = [];
  for (let i = 0; i < 6; i++) {
    const topic = i < 3 ? "algebra" : "geometry";
    const path = `${topic}/note${i}.md`;
    notes.push({ path, content: `${topic} words about ${topic} number${i} shared text` });
    const v = Array.from({ length: 8 }, (_, d) => (i < 3 ? 1 : -1) * (d % 2 === 0 ? 1 : 0.5) + i * 0.05 * d);
    vectors.set(path, v);
  }
  return notes;
}

const positionsOf = (view: VectorScatterView) => new Map(view.nodes.map((n) => [n.path, { x: n.x, y: n.y }]));

/** Lets debounce timers fire and the async work behind them settle. */
async function settle(ms = 1000): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  vi.useFakeTimers();
  storedPositions.clear();
  vectors.clear();
  relationEdges = [];
  vi.mocked(applyGraphVectorProjection).mockClear();
  vi.mocked(saveNodePositions).mockClear();
  vi.mocked(getStoredNodePositions).mockClear();
  vi.mocked(loadRelationEdges).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("VectorScatterView layout with the real simulation (#208)", () => {
  it("acceptance: repeated modify events without a layout-relevant change cause no simulation, no write and no movement", async () => {
    const { view, notes, fire, toFile } = createFixture(sixNotes());
    await view.scanVaultNotes();
    view.registerVaultWatchers();
    await settle();
    const before = positionsOf(view);
    vi.mocked(applyGraphVectorProjection).mockClear();
    vi.mocked(saveNodePositions).mockClear();

    for (let round = 0; round < 3; round++) {
      fire("modify", toFile(notes[0]));
      await settle();
    }

    expect(applyGraphVectorProjection).not.toHaveBeenCalled();
    expect(saveNodePositions).not.toHaveBeenCalled();
    expect(positionsOf(view)).toEqual(before);
  });

  it("start: stored positions for every node are shown unchanged, without simulation and without a write", async () => {
    const { view, notes } = createFixture(sixNotes());
    notes.forEach((n, i) => storedPositions.set(n.path, { x: 100 * i + 999, y: -50 * i + 888 }));
    const stored = new Map(notes.map((n) => [n.path, { ...storedPositions.get(n.path)! }]));

    await view.scanVaultNotes();
    await settle();

    expect(applyGraphVectorProjection).not.toHaveBeenCalled();
    expect(saveNodePositions).not.toHaveBeenCalled();
    expect(positionsOf(view)).toEqual(stored);
  });

  it("counter-check: a layout-relevant edit still runs the simulation", async () => {
    const { view, notes, fire, toFile } = createFixture(sixNotes());
    await view.scanVaultNotes();
    view.registerVaultWatchers();
    await settle();
    vi.mocked(applyGraphVectorProjection).mockClear();

    notes[0].content = "completely different vocabulary inserted here";
    fire("modify", toFile(notes[0]));
    await settle();

    expect(applyGraphVectorProjection).toHaveBeenCalled();
  });

  it("counter-check: opening without stored positions places every node and persists it", async () => {
    const { view } = createFixture(sixNotes());

    await view.scanVaultNotes();
    await settle();

    expect(applyGraphVectorProjection).toHaveBeenCalledTimes(1);
    expect(view.nodes.every((n) => n.x !== 0 || n.y !== 0)).toBe(true);
    expect(saveNodePositions).toHaveBeenCalled();
  });

  it("a layout setting changed in Settings re-runs the layout right away; an unrelated one does not", async () => {
    const { view } = createFixture(sixNotes());
    await view.scanVaultNotes();
    await settle();
    vi.mocked(applyGraphVectorProjection).mockClear();

    view.settings.language = "en";
    view.applyExternalSettingsChange();
    expect(applyGraphVectorProjection).not.toHaveBeenCalled();

    view.settings.includeWikiLinksAsRelations = !view.settings.includeWikiLinksAsRelations;
    view.applyExternalSettingsChange();
    expect(applyGraphVectorProjection).toHaveBeenCalledTimes(1);
  });
});

describe("VectorScatterView event queue and selective reads (#210)", () => {
  async function openWithWatchers(notes = sixNotes()) {
    const fixture = createFixture(notes);
    await fixture.view.scanVaultNotes();
    fixture.view.registerVaultWatchers();
    await settle();
    vi.mocked(fixture.vault.cachedRead).mockClear();
    vi.mocked(applyGraphVectorProjection).mockClear();
    vi.mocked(loadRelationEdges).mockClear();
    return fixture;
  }

  it("re-reads only the modified note, once for a burst of saves", async () => {
    const { view, notes, fire, toFile, vault } = await openWithWatchers();
    for (let i = 0; i < 4; i++) {
      fire("modify", toFile(notes[1]));
      await vi.advanceTimersByTimeAsync(300);
    }
    await settle();

    expect(vault.cachedRead).toHaveBeenCalledTimes(1);
    expect(vi.mocked(vault.cachedRead).mock.calls[0][0].path).toBe(notes[1].path);
    expect(view.nodes).toHaveLength(6);
  });

  it("ignores events for notes excluded from indexing or outside the view filter", async () => {
    const notes = [...sixNotes(), { path: "archive/old.md", content: "archived" }];
    const fixture = createFixture(notes);
    fixture.view.settings.vectorSearchExclusions = "-path:archive";
    await fixture.view.scanVaultNotes("algebra");
    fixture.view.registerVaultWatchers();
    await settle();
    vi.mocked(fixture.vault.cachedRead).mockClear();
    vi.mocked(applyGraphVectorProjection).mockClear();

    fixture.fire("modify", fixture.toFile(notes[6]));
    fixture.fire("modify", fixture.toFile(notes[4]));
    await settle();

    expect(fixture.vault.cachedRead).not.toHaveBeenCalled();
    expect(applyGraphVectorProjection).not.toHaveBeenCalled();
    expect(fixture.view.nodes.map((n) => n.path)).toEqual(["algebra/note0.md", "algebra/note1.md", "algebra/note2.md"]);
  });

  it("still reloads edges for relation notes and the vocabulary file outside the view filter", async () => {
    const notes = [...sixNotes(), { path: "wiki/relations/a--b.md", content: "---\ntype: relation\n---" }];
    const fixture = createFixture(notes);
    await fixture.view.scanVaultNotes("algebra");
    fixture.view.registerVaultWatchers();
    await settle();
    vi.mocked(loadRelationEdges).mockClear();

    fixture.fire("modify", fixture.toFile(notes[6]));
    await settle();
    expect(loadRelationEdges).toHaveBeenCalledTimes(1);

    fixture.fire("modify", { path: "wiki/relation-types.json" });
    await settle();
    expect(loadRelationEdges).toHaveBeenCalledTimes(2);
  });

  it("does not run the layout for a relation edit that only changes the description", async () => {
    relationEdges = [{ srcId: "algebra/note0", tgtId: "geometry/note3", relType: "REQUIRES", desc: "old", title: "", path: "wiki/relations/r.md", bidirectional: false }];
    const fixture = await openWithWatchers([...sixNotes(), { path: "wiki/relations/r.md", content: "---\ntype: relation\n---" }]);
    relationEdges = [{ ...relationEdges[0], desc: "a better reason" }];

    fixture.fire("modify", fixture.toFile(fixture.notes[6]));
    await settle();

    expect(loadRelationEdges).toHaveBeenCalledTimes(1);
    expect(applyGraphVectorProjection).not.toHaveBeenCalled();
    expect(fixture.view.relationEdges[0].desc).toBe("a better reason");
  });

  it("runs the layout when a relation edit changes the force", async () => {
    relationEdges = [{ srcId: "algebra/note0", tgtId: "geometry/note3", relType: "REQUIRES", desc: "", title: "", path: "wiki/relations/r.md", bidirectional: false }];
    const fixture = await openWithWatchers([...sixNotes(), { path: "wiki/relations/r.md", content: "---\ntype: relation\n---" }]);
    relationEdges = [{ ...relationEdges[0], relType: "CONFLICTS_WITH" }];

    fixture.fire("modify", fixture.toFile(fixture.notes[6]));
    await settle();

    expect(applyGraphVectorProjection).toHaveBeenCalled();
  });

  it("removes a shown note renamed into an excluded folder, and adds one renamed out of it", async () => {
    const fixture = await openWithWatchers();
    fixture.view.settings.vectorSearchExclusions = "-path:archive";
    const note = fixture.notes[2];
    const position = { x: fixture.view.nodes[2].x, y: fixture.view.nodes[2].y };

    const oldPath = note.path;
    note.path = "archive/note2.md";
    fixture.fire("rename", fixture.toFile(note), oldPath);
    await settle();
    expect(fixture.view.nodes.map((n) => n.path)).not.toContain(oldPath);
    expect(fixture.view.nodes).toHaveLength(5);

    note.path = "algebra/note2-renamed.md";
    fixture.fire("rename", fixture.toFile(note), "archive/note2.md");
    await settle();
    expect(fixture.view.nodes.map((n) => n.path)).toContain("algebra/note2-renamed.md");
    expect(fixture.view.nodes).toHaveLength(6);
    expect(position.x !== 0 || position.y !== 0).toBe(true);
  });

  it("carries the vector and position of a note renamed within the view instead of looking them up again", async () => {
    const fixture = await openWithWatchers();
    const before = fixture.view.nodes[1];
    const oldPath = fixture.notes[1].path;
    fixture.notes[1].path = "algebra/renamed.md";
    vi.mocked(getStoredNodePositions).mockClear();

    fixture.fire("rename", fixture.toFile(fixture.notes[1]), oldPath);
    await settle();

    const after = fixture.view.nodes.find((n) => n.path === "algebra/renamed.md")!;
    expect(after.embedding).toEqual(before.embedding);
    expect(after.x !== 0 || after.y !== 0).toBe(true);
    expect(getStoredNodePositions).not.toHaveBeenCalled();
  });

  it("adds a created note and drops a deleted one", async () => {
    const fixture = await openWithWatchers();
    fixture.notes.push({ path: "geometry/new.md", content: "geometry words new" });
    fixture.fire("create", fixture.toFile(fixture.notes[6]));
    const gone = fixture.notes[0];
    fixture.notes.splice(0, 1);
    fixture.fire("delete", fixture.toFile(gone));
    await settle();

    const paths = fixture.view.nodes.map((n) => n.path);
    expect(paths).toContain("geometry/new.md");
    expect(paths).not.toContain(gone.path);
    expect(fixture.view.nodes.find((n) => n.path === "geometry/new.md")!.x !== 0).toBe(true);
  });

  it("never lets an older full scan overwrite a newer one", async () => {
    const fixture = createFixture(sixNotes());
    const older = fixture.view.scanVaultNotes("algebra");
    const newer = fixture.view.scanVaultNotes("geometry");
    await Promise.all([older, newer]);

    expect(fixture.view.nodes.map((n) => n.path)).toEqual(["geometry/note3.md", "geometry/note4.md", "geometry/note5.md"]);
  });

  it("drops a queued incremental update that a newer full scan supersedes", async () => {
    const fixture = await openWithWatchers();
    fixture.fire("modify", fixture.toFile(fixture.notes[0]));
    await fixture.view.scanVaultNotes("geometry");
    await settle();

    expect(fixture.view.nodes.map((n) => n.path)).toEqual(["geometry/note3.md", "geometry/note4.md", "geometry/note5.md"]);
  });

  it("falls back to a full rescan when an incremental update fails", async () => {
    const fixture = await openWithWatchers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(fixture.vault.cachedRead).mockRejectedValueOnce(new Error("locked"));

    fixture.fire("modify", fixture.toFile(fixture.notes[0]));
    await settle();
    await settle();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("falling back to a full rescan"), expect.any(Error));
    expect(fixture.vault.cachedRead).toHaveBeenCalledTimes(7);
    expect(fixture.view.nodes).toHaveLength(6);
    warn.mockRestore();
  });
});

