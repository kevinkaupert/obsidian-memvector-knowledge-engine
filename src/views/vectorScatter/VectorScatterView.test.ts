import { describe, expect, it, vi } from "vitest";
import { TFile, type WorkspaceLeaf } from "obsidian";
import { VectorScatterView, type VectorScatterHost } from "./VectorScatterView";
import type { ScatterNode, ScatterNoteType } from "./types";
import { DEFAULT_SETTINGS } from "../../settings/defaults";
import { scanVaultNotes as scanVaultNotesPure } from "./vaultScan";
import { getVectorStore } from "../../sync/storeFactory";

if (typeof window === "undefined") {
  (globalThis as any).window = globalThis;
}
if (typeof (globalThis as any).ResizeObserver === "undefined") {
  (globalThis as any).ResizeObserver = class {
    observe = vi.fn();
    disconnect = vi.fn();
  };
}

function makeMockDiv(): any {
  const el: any = {
    addClass: vi.fn(),
    removeClass: vi.fn(),
    empty: vi.fn(),
    children: [],
    createDiv: vi.fn(() => makeMockDiv()),
    createEl: vi.fn(() => ({
      getContext: vi.fn(() => ({
        setTransform: vi.fn(),
        clearRect: vi.fn(),
      })),
      createDiv: vi.fn(() => makeMockDiv()),
      createEl: vi.fn(() => ({})),
      createSpan: vi.fn(() => ({ setText: vi.fn() })),
      classList: { toggle: vi.fn() },
      addEventListener: vi.fn(),
    })),
    createSpan: vi.fn(() => ({ setText: vi.fn() })),
    classList: { toggle: vi.fn() },
  };
  return el;
}

vi.mock("obsidian", () => ({
  ItemView: class {
    containerEl = makeMockDiv();
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
  buildToolbar: vi.fn(() => ({
    statusText: {} as any,
    updateSelectionUI: vi.fn(),
    updateEdgeHops: vi.fn(),
  })),
}));


vi.mock("./canvasInteraction", () => ({
  wireCanvasInteraction: vi.fn(() => vi.fn()),
}));

vi.mock("./layout/applyVectorLayout", () => ({
  applyVectorLayout: vi.fn(() => ({ matrix: [], bounds: null, centroidIds: [] })),
  prepareLayoutModel: vi.fn(() => ({ matrix: [], bounds: null, centroidIds: [] })),
}));

vi.mock("./rendering/drawOrchestrator", () => ({
  draw: vi.fn(),
}));

vi.mock("./relationEdges", () => ({
  loadRelationEdges: vi.fn(async () => []),
}));

vi.mock("./vaultScan", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./vaultScan")>()),
  scanVaultNotes: vi.fn(async () => []),
}));

vi.mock("../../sync/sqlite/nodePositions", () => ({
  getStoredNodePositions: vi.fn(async () => new Map()),
  saveNodePositions: vi.fn(async () => {}),
}));

vi.mock("../../sync/storeFactory", () => ({
  getVectorStore: vi.fn(() => ({
    getVectors: vi.fn(async () => new Map()),
  })),
}));

vi.mock("../../relationVocabulary/loadRelationVocabulary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../relationVocabulary/loadRelationVocabulary")>()),
  loadRelationVocabulary: vi.fn(async () => []),
}));

function makeNode(id: string, path: string, type: ScatterNoteType): ScatterNode {
  return {
    id,
    path,
    title: id,
    basenameKey: id,
    content: id,
    type,
    x: 0,
    y: 0,
    latexFormulas: [],
    links: [],
  };
}

function createMockHost(settingsOverrides: Partial<typeof DEFAULT_SETTINGS> = {}): VectorScatterHost {
  return {
    app: {
      vault: {
        getAbstractFileByPath: vi.fn(() => null),
        read: vi.fn(async () => ""),
        getMarkdownFiles: vi.fn(() => []),
        on: vi.fn(),
      },
    } as any,
    settings: { ...DEFAULT_SETTINGS, ...settingsOverrides },
    saveSettings: vi.fn(async () => {}),
    focusSidebarNote: vi.fn(),
  };
}

describe("VectorScatterView.setShowRelationNotes (#110)", () => {
  function makeView(): VectorScatterView {
    const leaf = {} as WorkspaceLeaf;
    const host = createMockHost();
    const view = new VectorScatterView(leaf, host);
    view.redraw = vi.fn();
    return view;
  }

  it("prunes relation notes from selectedNodeIds when toggled off while retaining regular notes", () => {
    const view = makeView();
    const concept = makeNode("concept1", "wiki/concepts/math.md", "concept");
    const relation = makeNode("rel1", "wiki/relations/rel.md", "relation");
    view.nodes = [concept, relation];
    view.selectedNodeIds = new Set(["concept1", "rel1"]);

    view.setShowRelationNotes(false);

    expect(view.showRelationNotes).toBe(false);
    expect(view.selectedNodeIds.has("concept1")).toBe(true);
    expect(view.selectedNodeIds.has("rel1")).toBe(false);
    expect(view.redraw).toHaveBeenCalled();
  });

  it("resets hoveredNode when it is a relation node", () => {
    const view = makeView();
    const relation = makeNode("rel1", "wiki/relations/rel.md", "relation");
    view.nodes = [relation];
    view.hoveredNode = relation;

    view.setShowRelationNotes(false);

    expect(view.hoveredNode).toBeNull();
  });

  it("leaves hoveredNode intact when it is a non-relation node", () => {
    const view = makeView();
    const concept = makeNode("concept1", "wiki/concepts/math.md", "concept");
    view.nodes = [concept];
    view.hoveredNode = concept;

    view.setShowRelationNotes(false);

    expect(view.hoveredNode).toBe(concept);
  });
});

describe("VectorScatterView.applyExternalSettingsChange", () => {
  function makeView(settings: Partial<typeof DEFAULT_SETTINGS> = {}): VectorScatterView {
    const leaf = {} as WorkspaceLeaf;
    const host = createMockHost(settings);
    const view = new VectorScatterView(leaf, host);
    view.redraw = vi.fn();
    return view;
  }

  it("redraws so a visual-style change made in Settings shows up without reopening the view", () => {
    const view = makeView();
    view.applyExternalSettingsChange();
    expect(view.redraw).toHaveBeenCalled();
  });

  it("picks up a relation-note visibility change made in Settings", () => {
    const view = makeView();
    view.nodes = [makeNode("rel1", "wiki/relations/rel.md", "relation")];
    view.showRelationNotes = true;
    view.selectedNodeIds = new Set(["rel1"]);

    view.settings.showRelationNotes = false;
    view.applyExternalSettingsChange();

    expect(view.showRelationNotes).toBe(false);
    expect(view.selectedNodeIds.has("rel1")).toBe(false);
    expect(view.redraw).toHaveBeenCalled();
  });

  it("re-runs the layout when asked to, because changed relation weights move nodes", () => {
    const view = makeView();
    view.refreshRelationEdges = vi.fn();
    view.applyExternalSettingsChange({ relayout: true });
    expect(view.refreshRelationEdges).toHaveBeenCalled();
  });

  it("does not re-run the layout for a plain redraw", () => {
    const view = makeView();
    view.refreshRelationEdges = vi.fn();
    view.applyExternalSettingsChange();
    expect(view.refreshRelationEdges).not.toHaveBeenCalled();
  });

  it("picks up scatterEdgeHops changes from external settings", () => {
    const view = makeView();
    view.edgeHops = 1;
    view.settings.scatterEdgeHops = 0;
    view.applyExternalSettingsChange();
    expect(view.edgeHops).toBe(0);
    expect(view.redraw).toHaveBeenCalled();
  });
});

describe("VectorScatterView Live Vault Watcher (Issue #63)", () => {
  it("registers vault event listeners for create, modify, delete, and rename", () => {
    const registeredCallbacks = new Map<string, Function>();
    const fakeVault = {
      on: vi.fn((event: string, callback: Function) => {
        registeredCallbacks.set(event, callback);
        return { event, callback };
      }),
    };

    const leaf = {} as WorkspaceLeaf;
    const host: VectorScatterHost = {
      app: { vault: fakeVault } as any,
      settings: { ...DEFAULT_SETTINGS },
      saveSettings: vi.fn(async () => {}),
      focusSidebarNote: vi.fn(),
    };
    const view = new VectorScatterView(leaf, host);
    view.registerVaultWatchers();

    expect(fakeVault.on).toHaveBeenCalledWith("create", expect.any(Function));
    expect(fakeVault.on).toHaveBeenCalledWith("modify", expect.any(Function));
    expect(fakeVault.on).toHaveBeenCalledWith("delete", expect.any(Function));
    expect(fakeVault.on).toHaveBeenCalledWith("rename", expect.any(Function));
    expect(view.registerEvent).toHaveBeenCalledTimes(4);

    // Verify relation changes trigger triggerRelationsReload
    view.triggerRelationsReload = vi.fn();
    view.triggerVaultRescan = vi.fn();

    const modifyCb = registeredCallbacks.get("modify");
    expect(modifyCb).toBeDefined();

    // Modifying a relation file triggers triggerRelationsReload
    modifyCb!({ path: "wiki/relations/concept-a--supports--concept-b.md" });
    expect(view.triggerRelationsReload).toHaveBeenCalledTimes(1);
    expect(view.triggerVaultRescan).not.toHaveBeenCalled();

    // Modifying a regular markdown note triggers triggerVaultRescan
    modifyCb!({ path: "wiki/concepts/math.md" });
    expect(view.triggerVaultRescan).toHaveBeenCalledTimes(1);

    // Renaming a hidden relation note only changes edges; it is not a node while relation notes are hidden (#210)
    const renameCb = registeredCallbacks.get("rename");
    expect(renameCb).toBeDefined();
    renameCb!({ path: "wiki/relations/new-rel.md" }, "wiki/relations/old-rel.md");
    expect(view.triggerRelationsReload).toHaveBeenCalledTimes(2);
    expect(view.triggerVaultRescan).toHaveBeenCalledTimes(1);

    // Renaming a regular note queues that one rename
    renameCb!({ path: "wiki/concepts/new-note.md" }, "wiki/concepts/old-note.md");
    expect(view.triggerVaultRescan).toHaveBeenLastCalledWith({ kind: "rename", path: "wiki/concepts/new-note.md", oldPath: "wiki/concepts/old-note.md" });
  });

  it("clears debounce timers and cleans up on onClose", async () => {
    vi.useFakeTimers();
    const leaf = {} as WorkspaceLeaf;
    const host: VectorScatterHost = {
      app: { vault: { on: vi.fn() } } as any,
      settings: { ...DEFAULT_SETTINGS },
      saveSettings: vi.fn(async () => {}),
      focusSidebarNote: vi.fn(),
    };
    const view = new VectorScatterView(leaf, host);
    view.loadRelationEdges = vi.fn().mockResolvedValue([]);
    view.applyLayout = vi.fn();
    view.redraw = vi.fn();
    view.scanVaultNotes = vi.fn().mockResolvedValue(undefined);

    view.triggerRelationsReload();
    view.triggerVaultRescan();

    // Advance 200ms (before timers trigger)
    vi.advanceTimersByTime(200);
    expect(view.loadRelationEdges).not.toHaveBeenCalled();
    expect(view.scanVaultNotes).not.toHaveBeenCalled();

    // Close view before they fire
    await view.onClose();

    // Advance past timers
    vi.advanceTimersByTime(1000);
    expect(view.loadRelationEdges).not.toHaveBeenCalled();
    expect(view.scanVaultNotes).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});

/** View with the pure vault scan and vector store mocked, for exercising scanVaultNotes end to end. */
function makeScanView(): VectorScatterView {
  const host: VectorScatterHost = {
    app: {} as any,
    settings: { ...DEFAULT_SETTINGS },
    saveSettings: vi.fn(async () => {}),
    focusSidebarNote: vi.fn(),
  };
  const view = new VectorScatterView({} as WorkspaceLeaf, host);
  view.redraw = vi.fn();
  return view;
}

function mockStoredVectors(vectors: Map<string, number[]> | Error): void {
  vi.mocked(getVectorStore).mockReturnValue({
    getVectors: vectors instanceof Error ? vi.fn().mockRejectedValue(vectors) : vi.fn().mockResolvedValue(vectors),
  } as unknown as ReturnType<typeof getVectorStore>);
}

describe("VectorScatterView.scanVaultNotes uses the vector store as source of truth (#167)", () => {
  it("replaces a stale in-memory embedding with the re-indexed stored vector", async () => {
    const view = makeScanView();
    view.nodes = [{ ...makeNode("a", "A.md", "concept"), embedding: [1, 0] }];
    vi.mocked(scanVaultNotesPure).mockResolvedValue([makeNode("a", "A.md", "concept")]);
    mockStoredVectors(new Map([["A.md", [0, 1]]]));

    await view.scanVaultNotes();

    expect(view.nodes[0].embedding).toEqual([0, 1]);
  });

  it("drops an in-memory embedding the store no longer has (e.g. after an embedding model switch)", async () => {
    const view = makeScanView();
    view.nodes = [{ ...makeNode("a", "A.md", "concept"), embedding: [1, 0] }];
    vi.mocked(scanVaultNotesPure).mockResolvedValue([makeNode("a", "A.md", "concept")]);
    mockStoredVectors(new Map());

    await view.scanVaultNotes();

    expect(view.nodes[0].embedding).toBeUndefined();
  });

  it("keeps in-memory embeddings when the store cannot be read", async () => {
    const view = makeScanView();
    view.nodes = [{ ...makeNode("a", "A.md", "concept"), embedding: [1, 0] }];
    vi.mocked(scanVaultNotesPure).mockResolvedValue([makeNode("a", "A.md", "concept")]);
    mockStoredVectors(new Error("db locked"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await view.scanVaultNotes();

    expect(view.nodes[0].embedding).toEqual([1, 0]);
    warn.mockRestore();
  });
});


/** View with vault watchers registered against a fake vault; returns the captured event callbacks. */
function makeWatchedView(settings: Partial<typeof DEFAULT_SETTINGS> = {}) {
  const callbacks = new Map<string, Function>();
  const vault = { on: vi.fn((event: string, cb: Function) => (callbacks.set(event, cb), { event, cb })) };
  const host: VectorScatterHost = {
    app: { vault } as any,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    saveSettings: vi.fn(async () => {}),
    focusSidebarNote: vi.fn(),
  };
  const view = new VectorScatterView({} as WorkspaceLeaf, host);
  view.registerVaultWatchers();
  view.triggerRelationsReload = vi.fn();
  view.triggerVaultRescan = vi.fn();
  return { view, callbacks };
}

describe("VectorScatterView watcher and camera (#162)", () => {
  it("reloads relations when the active vocabulary file changes", () => {
    const { view, callbacks } = makeWatchedView();
    callbacks.get("modify")!({ path: "wiki/relation-types.json" });
    expect(view.triggerRelationsReload).toHaveBeenCalledTimes(1);
  });

  it("follows a configured vocabulary path, including renames to and from it", () => {
    const { view, callbacks } = makeWatchedView({ relationVocabularyPath: "wiki/presets/law.json" });
    callbacks.get("modify")!({ path: "wiki/presets/law.json" });
    callbacks.get("rename")!({ path: "wiki/presets/law.json" }, "wiki/presets/tmp.json");
    callbacks.get("modify")!({ path: "wiki/relation-types.json" });
    expect(view.triggerRelationsReload).toHaveBeenCalledTimes(2);
    expect(view.triggerVaultRescan).not.toHaveBeenCalled();
  });

  it("background rescans keep the user's pan and zoom", async () => {
    vi.useFakeTimers();
    const view = makeScanView();
    (view as any).canvasWrap = { clientWidth: 800, clientHeight: 600 };
    view.nodes = [{ ...makeNode("a", "A.md", "concept"), x: 5000, y: 5000 }];
    vi.mocked(scanVaultNotesPure).mockResolvedValue([{ ...makeNode("a", "A.md", "concept"), x: 5000, y: 5000 }]);
    mockStoredVectors(new Map());
    view.zoom = 2.5;
    view.pan = { x: 123, y: 456 };

    view.triggerVaultRescan();
    await vi.advanceTimersByTimeAsync(1000);
    vi.useRealTimers();

    expect(scanVaultNotesPure).toHaveBeenCalled();
    expect(view.zoom).toBe(2.5);
    expect(view.pan).toEqual({ x: 123, y: 456 });
  });

  it("explicit scans still fit the camera to the node set", async () => {
    const view = makeScanView();
    (view as any).canvasWrap = { clientWidth: 800, clientHeight: 600 };
    vi.mocked(scanVaultNotesPure).mockResolvedValue([{ ...makeNode("a", "A.md", "concept"), x: 5000, y: 5000 }]);
    mockStoredVectors(new Map());
    view.zoom = 2.5;
    view.pan = { x: 123, y: 456 };

    await view.scanVaultNotes("A");

    expect(view.pan).not.toEqual({ x: 123, y: 456 });
  });
});

describe("VectorScatterView watcher keeps relation note nodes current (#168)", () => {
  it("reloads edges for a created or deleted relation note, and updates nodes only when relation notes are shown", () => {
    const hidden = makeWatchedView();
    hidden.callbacks.get("create")!({ path: "wiki/relations/a--supports--b.md" });
    hidden.callbacks.get("delete")!({ path: "wiki/relations/c--supports--d.md" });
    expect(hidden.view.triggerRelationsReload).toHaveBeenCalledTimes(2);
    expect(hidden.view.triggerVaultRescan).not.toHaveBeenCalled();

    const shown = makeWatchedView({ showRelationNotes: true });
    shown.view.showRelationNotes = true;
    shown.view.nodes = [makeNode("rel", "wiki/relations/c--supports--d.md", "relation")];
    shown.callbacks.get("create")!({ path: "wiki/relations/a--supports--b.md" });
    shown.callbacks.get("delete")!({ path: "wiki/relations/c--supports--d.md" });
    expect(shown.view.triggerVaultRescan).toHaveBeenCalledWith({ kind: "upsert", path: "wiki/relations/a--supports--b.md" });
    expect(shown.view.triggerVaultRescan).toHaveBeenCalledWith({ kind: "delete", path: "wiki/relations/c--supports--d.md" });
  });

  it("checks both paths when a note is renamed into or out of the relations folder", () => {
    const { view, callbacks } = makeWatchedView();
    // Out of the relations folder: becomes a regular, shown note.
    callbacks.get("rename")!({ path: "wiki/concepts/moved.md" }, "wiki/relations/moved.md");
    expect(view.triggerVaultRescan).toHaveBeenLastCalledWith({ kind: "rename", path: "wiki/concepts/moved.md", oldPath: "wiki/relations/moved.md" });
    // Into the relations folder: a shown note disappears from the view.
    view.nodes = [makeNode("moved", "wiki/concepts/moved.md", "concept")];
    callbacks.get("rename")!({ path: "wiki/relations/moved.md" }, "wiki/concepts/moved.md");
    expect(view.triggerVaultRescan).toHaveBeenLastCalledWith({ kind: "rename", path: "wiki/relations/moved.md", oldPath: "wiki/concepts/moved.md" });
    expect(view.triggerRelationsReload).toHaveBeenCalledTimes(2);
  });

  it("keeps a plain relation note edit on the lighter edge reload", () => {
    const { view, callbacks } = makeWatchedView();
    callbacks.get("modify")!({ path: "wiki/relations/a--supports--b.md" });
    expect(view.triggerRelationsReload).toHaveBeenCalledTimes(1);
    expect(view.triggerVaultRescan).not.toHaveBeenCalled();
  });

  it("drops a deleted relation note's node on the rescan", async () => {
    const view = makeScanView();
    view.showRelationNotes = true;
    view.nodes = [makeNode("a", "A.md", "concept"), makeNode("rel", "wiki/relations/rel.md", "relation")];
    vi.mocked(scanVaultNotesPure).mockResolvedValue([makeNode("a", "A.md", "concept")]);
    mockStoredVectors(new Map());

    await view.scanVaultNotes(undefined, { preserveView: true });

    expect(view.getVisibleNodes().map((n) => n.path)).toEqual(["A.md"]);
  });
});

describe("VectorScatterView reconciles selection and search with rescanned nodes (#171)", () => {
  it("removes deleted notes from the selection, keeping the same set instance", async () => {
    const view = makeScanView();
    view.nodes = [makeNode("a", "A.md", "concept"), makeNode("b", "B.md", "concept")];
    const selection = view.selectedNodeIds;
    selection.add("a");
    selection.add("b");
    vi.mocked(scanVaultNotesPure).mockResolvedValue([makeNode("a", "A.md", "concept")]);
    mockStoredVectors(new Map());

    await view.scanVaultNotes(undefined, { preserveView: true });

    expect(view.selectedNodeIds).toBe(selection);
    expect([...view.selectedNodeIds]).toEqual(["a"]);
  });

  it("repeating a search after a rescan pans to the note's current position, not the stale one", async () => {
    const view = makeScanView();
    (view as any).canvasWrap = { clientWidth: 800, clientHeight: 600 };
    (view as any).containerEl.win = { requestAnimationFrame: vi.fn(() => 1), cancelAnimationFrame: vi.fn() };
    view.zoom = 1;
    view.nodes = [{ ...makeNode("alpha", "Alpha.md", "concept"), x: 0, y: 0 }];

    view.searchNote("alpha");
    expect(view.pan).toEqual({ x: 400, y: 300 });

    vi.mocked(scanVaultNotesPure).mockResolvedValue([{ ...makeNode("alpha", "Alpha.md", "concept"), x: 1000, y: 500 }]);
    mockStoredVectors(new Map());
    await view.scanVaultNotes(undefined, { preserveView: true });

    view.searchNote("alpha");
    expect(view.pan).toEqual({ x: 400 - 1000, y: 300 - 500 });
  });

  it("drops a hovered node that no longer exists", async () => {
    const view = makeScanView();
    const gone = makeNode("b", "B.md", "concept");
    view.nodes = [makeNode("a", "A.md", "concept"), gone];
    view.hoveredNode = gone;
    vi.mocked(scanVaultNotesPure).mockResolvedValue([makeNode("a", "A.md", "concept")]);
    mockStoredVectors(new Map());

    await view.scanVaultNotes(undefined, { preserveView: true });

    expect(view.hoveredNode).toBeNull();
  });
});

describe("VectorScatterView reloads embeddings when the embedding target or index changes (#175)", () => {
  it("replaces in-memory vectors with the stored ones and drops those the store lacks", async () => {
    vi.useFakeTimers();
    const view = makeScanView();
    view.nodes = [
      { ...makeNode("a", "A.md", "concept"), embedding: [0, 9, 9, 9] },
      { ...makeNode("b", "B.md", "concept"), embedding: [0, 8, 8, 8] },
    ];
    mockStoredVectors(new Map([["A.md", [1, 0, 0]]]));

    view.applyExternalSettingsChange({ embeddings: true });
    await vi.advanceTimersByTimeAsync(400);
    vi.useRealTimers();

    expect(view.nodes[0].embedding).toEqual([1, 0, 0]);
    expect(view.nodes[1].embedding).toBeUndefined();
  });

  it("debounces bursts of changes (the model field saves on every keystroke)", async () => {
    vi.useFakeTimers();
    const view = makeScanView();
    view.nodes = [makeNode("a", "A.md", "concept")];
    const getVectors = vi.fn().mockResolvedValue(new Map([["A.md", [1, 0, 0]]]));
    vi.mocked(getVectorStore).mockReturnValue({ getVectors } as unknown as ReturnType<typeof getVectorStore>);
    for (let i = 0; i < 5; i++) view.applyExternalSettingsChange({ embeddings: true });
    await vi.advanceTimersByTimeAsync(400);
    vi.useRealTimers();

    expect(getVectors).toHaveBeenCalledTimes(1);
    expect(view.nodes[0].embedding).toEqual([1, 0, 0]);
  });
});

describe("VectorScatterView watcher recognizes deleted relation notes outside the relations folder", () => {
  it("reloads edges when a known relation note is deleted or renamed away, although no frontmatter is left", () => {
    const { view, callbacks } = makeWatchedView();
    view.relationEdges = [
      { srcId: "a", tgtId: "b", relType: "REQUIRES", desc: "", title: "", path: "Beziehungen/a--b.md", bidirectional: false },
      { srcId: "c", tgtId: "d", relType: "REQUIRES", desc: "", title: "", path: "Beziehungen/c--d.md", bidirectional: false },
    ];
    callbacks.get("delete")!({ path: "Beziehungen/a--b.md" });
    expect(view.triggerRelationsReload).toHaveBeenCalledTimes(1);
    callbacks.get("rename")!({ path: "Archiv/c--d.md" }, "Beziehungen/c--d.md");
    expect(view.triggerRelationsReload).toHaveBeenCalledTimes(2);
  });

  it("does not reload edges for deleting an unrelated note", () => {
    const { view, callbacks } = makeWatchedView();
    view.relationEdges = [{ srcId: "a", tgtId: "b", relType: "REQUIRES", desc: "", title: "", path: "Beziehungen/a--b.md", bidirectional: false }];
    callbacks.get("delete")!({ path: "Notes/other.md" });
    expect(view.triggerRelationsReload).not.toHaveBeenCalled();
  });
});

describe("VectorScatterView watcher recognizes moved relation notes (#173)", () => {
  it("keeps a modify of a relation note outside wiki/relations on the edge-only reload", () => {
    const { view, callbacks } = makeWatchedView();
    (view.app as any).metadataCache = {
      getFileCache: (f: { path: string }) => (f.path === "Beziehungen/a.md" ? { frontmatter: { type: "relation" } } : null),
    };
    callbacks.get("modify")!(Object.assign(new TFile(), { path: "Beziehungen/a.md" }));
    expect(view.triggerRelationsReload).toHaveBeenCalledTimes(1);
    expect(view.triggerVaultRescan).not.toHaveBeenCalled();

    callbacks.get("modify")!(Object.assign(new TFile(), { path: "Customers/relations/b.md" }));
    expect(view.triggerRelationsReload).toHaveBeenCalledTimes(1);
    expect(view.triggerVaultRescan).toHaveBeenCalledTimes(1);
  });
});

describe("VectorScatterView camera viewport persistence (getState/setState)", () => {
  it("serializes current pan, zoom, and edgeHops into workspace state", () => {
    const leaf = {} as WorkspaceLeaf;
    const host = createMockHost();
    const view = new VectorScatterView(leaf, host);
    view.pan = { x: 123.4, y: -56.7 };
    view.zoom = 1.45;
    view.edgeHops = 3;

    const state = view.getState();
    expect(state).toEqual(expect.objectContaining({
      pan: { x: 123.4, y: -56.7 },
      zoom: 1.45,
      edgeHops: 3,
    }));
  });

  it("restores pan, zoom, and edgeHops from workspace state and marks hasFittedView", async () => {
    const leaf = {} as WorkspaceLeaf;
    const host = createMockHost();
    const view = new VectorScatterView(leaf, host);
    await view.setState({ pan: { x: 300, y: 400 }, zoom: 0.8, edgeHops: 2 }, {} as any);

    expect(view.pan).toEqual({ x: 300, y: 400 });
    expect(view.zoom).toBe(0.8);
    expect(view.edgeHops).toBe(2);
  });

  it("initializes edgeHops from settings.scatterEdgeHops on onOpen", async () => {
    const leaf = {} as WorkspaceLeaf;
    const host = createMockHost({ scatterEdgeHops: 3 });
    const view = new VectorScatterView(leaf, host);
    view.scanVaultNotes = vi.fn().mockResolvedValue(undefined);
    await view.onOpen();
    expect(view.edgeHops).toBe(3);
  });
});

describe("VectorScatterView position preservation across rescans", () => {
  it("preserves in-memory coordinates of existing nodes during vault rescans", async () => {
    const leaf = {} as WorkspaceLeaf;
    const host = createMockHost();
    const view = new VectorScatterView(leaf, host);

    // Initial node with established coordinates
    const initialNode = makeNode("n1", "wiki/n1.md", "concept");
    initialNode.x = 250;
    initialNode.y = 350;
    view.nodes = [initialNode];
    (view as any).positionsHydrated = true;

    // Mock scanVaultNotesPure returning fresh instance of n1 at x:0, y:0
    const { scanVaultNotes } = await import("./vaultScan");
    vi.mocked(scanVaultNotes).mockResolvedValueOnce([
      makeNode("n1", "wiki/n1.md", "concept"),
      makeNode("n2_new", "wiki/n2_new.md", "concept"),
    ]);

    await view.scanVaultNotes();

    const n1 = view.nodes.find((n) => n.id === "n1");
    expect(n1).toBeDefined();
    // Existing node preserved its coordinates
    expect(n1!.x).toBe(250);
    expect(n1!.y).toBe(350);
  });

  it("hydrates stored positions from SQLite for unplaced nodes", async () => {
    const leaf = {} as WorkspaceLeaf;
    const host = createMockHost();
    const view = new VectorScatterView(leaf, host);

    const { scanVaultNotes } = await import("./vaultScan");
    vi.mocked(scanVaultNotes).mockResolvedValueOnce([
      makeNode("stored_note", "wiki/stored_note.md", "concept"),
    ]);

    const { getStoredNodePositions } = await import("../../sync/sqlite/nodePositions");
    vi.mocked(getStoredNodePositions).mockResolvedValueOnce(
      new Map([["stored_note", { x: 777, y: 888 }]])
    );

    await view.scanVaultNotes();

    const node = view.nodes.find((n) => n.id === "stored_note");
    expect(node).toBeDefined();
    expect(node!.x).toBe(777);
    expect(node!.y).toBe(888);
  });

  it("adversarial (Issue #184): does not overwrite stored positions in SQLite if hydration throws an error", async () => {
    const leaf = {} as WorkspaceLeaf;
    const host = createMockHost();
    const view = new VectorScatterView(leaf, host);

    const { scanVaultNotes } = await import("./vaultScan");
    vi.mocked(scanVaultNotes).mockResolvedValueOnce([
      makeNode("unplaced_note", "wiki/unplaced.md", "concept"),
    ]);

    const { getStoredNodePositions, saveNodePositions } = await import("../../sync/sqlite/nodePositions");
    vi.mocked(getStoredNodePositions).mockRejectedValueOnce(new Error("Transient SQLite read lock"));
    vi.mocked(saveNodePositions).mockClear();

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await view.scanVaultNotes();

      // Guarantee: saveNodePositions was NOT called when hydration failed
      expect(saveNodePositions).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("aborting position persistence to protect mental map"),
        expect.any(Error)
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("adversarial (Issue #184 deferred clobber): failed hydration followed by successful hydration restores store coordinates instead of being shadowed by in-memory positions", async () => {
    const leaf = {} as WorkspaceLeaf;
    const host = createMockHost();
    const view = new VectorScatterView(leaf, host);

    const { scanVaultNotes } = await import("./vaultScan");
    vi.mocked(scanVaultNotes).mockResolvedValue([
      makeNode("target_note", "wiki/target.md", "concept"),
    ]);

    const { getStoredNodePositions, saveNodePositions } = await import("../../sync/sqlite/nodePositions");
    // Scan 1: hydration throws error
    vi.mocked(getStoredNodePositions).mockRejectedValueOnce(new Error("Transient SQLite lock"));
    vi.mocked(saveNodePositions).mockClear();

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await view.scanVaultNotes();

      // View computed in-memory coordinates during scan 1, but saveNodePositions was not called
      expect(saveNodePositions).not.toHaveBeenCalled();

      // Scan 2: SQLite is now available and returns the authoritative position
      vi.mocked(getStoredNodePositions).mockResolvedValueOnce(
        new Map([["target_note", { x: 999, y: 888 }]])
      );

      await view.scanVaultNotes();

      const node = view.nodes.find((n) => n.id === "target_note");
      expect(node).toBeDefined();
      // Must be restored to the true stored position (999, 888) and NOT shadowed by Scan 1's PCA coordinates!
      expect(node!.x).toBe(999);
      expect(node!.y).toBe(888);

      // The restored position already is the stored one: nothing is written back, and scan 1's coordinates
      // never reach the store (ADR-0006: no write without a layout change).
      expect(saveNodePositions).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});



describe("VectorScatterView rescans when relation-note visibility changes (#204)", () => {
  it("shows relation notes right after enabling the toggle, without any other rescan", async () => {
    const view = makeScanView();
    const concept = makeNode("a", "A.md", "concept");
    const relation = makeNode("rel", "wiki/relations/rel.md", "relation");
    view.nodes = [concept];
    vi.mocked(scanVaultNotesPure).mockImplementation(async (_app, _filter, _excl, _dir, show) => (show ? [concept, relation] : [concept]));
    mockStoredVectors(new Map());

    view.setShowRelationNotes(true);

    await vi.waitFor(() => expect(view.getVisibleNodes().map((n) => n.path)).toEqual(["A.md", "wiki/relations/rel.md"]));
    expect(vi.mocked(scanVaultNotesPure).mock.lastCall?.[4]).toBe(true);
  });

  it("rescans with preserveView when the toggle changes from Settings", () => {
    const view = makeScanView();
    const scan = vi.spyOn(view, "scanVaultNotes").mockResolvedValue();

    view.settings.showRelationNotes = true;
    view.applyExternalSettingsChange();

    expect(scan).toHaveBeenCalledWith(undefined, { preserveView: true });
  });

  it("drops relation nodes from the node list, not only from rendering, when the toggle is disabled", async () => {
    const view = makeScanView();
    const concept = makeNode("a", "A.md", "concept");
    view.showRelationNotes = true;
    view.nodes = [concept, makeNode("rel", "wiki/relations/rel.md", "relation")];
    vi.mocked(scanVaultNotesPure).mockImplementation(async (_app, _filter, _excl, _dir, show) => (show ? view.nodes : [concept]));
    mockStoredVectors(new Map());

    view.setShowRelationNotes(false);

    await vi.waitFor(() => expect(view.nodes.map((n) => n.path)).toEqual(["A.md"]));
  });

  it("does not rescan when the value is unchanged", () => {
    const view = makeScanView();
    const scan = vi.spyOn(view, "scanVaultNotes").mockResolvedValue();

    view.setShowRelationNotes(false);

    expect(scan).not.toHaveBeenCalled();
  });

  it("logs instead of swallowing a failed rescan", async () => {
    const view = makeScanView();
    const err = new Error("scan failed");
    vi.spyOn(view, "scanVaultNotes").mockRejectedValue(err);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    view.setShowRelationNotes(true);

    await vi.waitFor(() => expect(log).toHaveBeenCalledWith(expect.stringContaining("relation note visibility"), err));
    log.mockRestore();
  });
});
