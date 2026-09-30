import { describe, expect, it, vi } from "vitest";
import type { WorkspaceLeaf } from "obsidian";
import { VectorScatterView, type VectorScatterHost } from "./VectorScatterView";
import type { ScatterNode, ScatterNoteType } from "./types";
import { DEFAULT_SETTINGS } from "../../settings/defaults";
import { scanVaultNotes as scanVaultNotesPure } from "./vaultScan";
import { getVectorStore } from "../../sync/storeFactory";

if (typeof window === "undefined") {
  (globalThis as any).window = globalThis;
}

vi.mock("obsidian", () => ({
  ItemView: class {
    containerEl = {
      addClass: vi.fn(),
      children: [],
      createDiv: vi.fn(),
      empty: vi.fn(),
    };
    addAction = vi.fn();
    registerEvent = vi.fn();
  },
  Modal: class {},
  Notice: class {},
  TFile: class {},
  setIcon: vi.fn(),
}));

vi.mock("./canvasInteraction", () => ({
  wireCanvasInteraction: vi.fn(() => vi.fn()),
}));

vi.mock("./layout/applyVectorLayout", () => ({
  applyVectorLayout: vi.fn(),
}));

vi.mock("./rendering/drawOrchestrator", () => ({
  draw: vi.fn(),
}));

vi.mock("./relationEdges", () => ({
  loadRelationEdges: vi.fn(async () => []),
}));

vi.mock("./vaultScan", () => ({
  scanVaultNotes: vi.fn(async () => []),
}));

vi.mock("../../sync/storeFactory", () => ({
  getVectorStore: vi.fn(),
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

describe("VectorScatterView.setShowRelationNotes (#110)", () => {
  function makeView(): VectorScatterView {
    const leaf = {} as WorkspaceLeaf;
    const host: VectorScatterHost = {
      app: {} as any,
      settings: { ...DEFAULT_SETTINGS },
      saveSettings: vi.fn(async () => {}),
      focusSidebarNote: vi.fn(),
    };
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
    const host: VectorScatterHost = {
      app: {} as any,
      settings: { ...DEFAULT_SETTINGS, ...settings },
      saveSettings: vi.fn(async () => {}),
      focusSidebarNote: vi.fn(),
    };
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

    // Renaming a relation file triggers triggerRelationsReload
    const renameCb = registeredCallbacks.get("rename");
    expect(renameCb).toBeDefined();
    renameCb!({ path: "wiki/relations/new-rel.md" }, "wiki/relations/old-rel.md");
    expect(view.triggerRelationsReload).toHaveBeenCalledTimes(2);

    // Renaming a regular note triggers triggerVaultRescan
    renameCb!({ path: "wiki/concepts/new-note.md" }, "wiki/concepts/old-note.md");
    expect(view.triggerVaultRescan).toHaveBeenCalledTimes(2);
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
