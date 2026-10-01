import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceLeaf } from "obsidian";
import { VectorScatterView, type VectorScatterHost } from "./VectorScatterView";
import { DEFAULT_SETTINGS } from "../../settings/defaults";
import { applyGraphVectorProjection } from "./layout/projections";
import { getStoredNodePositions, saveNodePositions } from "../../sync/sqlite/nodePositions";
import type { RelationEdge } from "./types";

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
  const toFile = (n: FakeNote) => ({
    path: n.path,
    basename: n.path.replace(/^.*\//, "").replace(/\.md$/, ""),
    name: n.path.replace(/^.*\//, ""),
    extension: "md",
  });
  const app = {
    vault: {
      getMarkdownFiles: () => notes.map(toFile),
      cachedRead: async (f: { path: string }) => notes.find((n) => n.path === f.path)?.content ?? "",
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
  return { view, notes, fire, toFile };
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
