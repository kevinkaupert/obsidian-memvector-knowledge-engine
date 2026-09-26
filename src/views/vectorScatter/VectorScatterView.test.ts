import { describe, expect, it, vi } from "vitest";
import type { WorkspaceLeaf } from "obsidian";
import { VectorScatterView, type VectorScatterHost } from "./VectorScatterView";
import type { ScatterNode, ScatterNoteType } from "./types";
import { DEFAULT_SETTINGS } from "../../settings/defaults";

vi.mock("obsidian", () => ({
  ItemView: class {
    containerEl = {
      addClass: vi.fn(),
      children: [],
      createDiv: vi.fn(),
      empty: vi.fn(),
    };
    addAction = vi.fn();
  },
  Modal: class {},
  Notice: class {},
  TFile: class {},
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
