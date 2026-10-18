/**
 * Purpose: Characterization of the 2D view's mouse flows (#77): pan, lasso in a transformed view, click selection,
 * edge click, double click and releases outside the canvas or after a window move. Recorded before the interaction
 * state was grouped; the flows must behave the same afterwards.
 */
import { describe, expect, it, vi } from "vitest";
import { wireCanvasInteraction } from "./canvasInteraction";
import type { ScatterViewContext } from "./context";
import { hitTest } from "./hitTesting";
import type { RelationEdge, ScatterNode } from "./types";

vi.mock("obsidian", () => ({ TFile: class {}, Notice: class {} }));
import { TFile } from "obsidian";

type Handler = (e: Record<string, unknown>) => void;

function fakeWindow() {
  const listeners = new Map<string, Set<Handler>>();
  const frames: Array<() => void> = [];
  return {
    frames,
    fire: (type: string, e: Record<string, unknown> = {}) => [...(listeners.get(type) ?? [])].forEach((fn) => fn(e)),
    win: {
      requestAnimationFrame: (cb: () => void) => frames.push(cb),
      cancelAnimationFrame: () => undefined,
      addEventListener: (t: string, fn: Handler) => (listeners.get(t) ?? listeners.set(t, new Set()).get(t)!).add(fn),
      removeEventListener: (t: string, fn: Handler) => listeners.get(t)?.delete(fn),
    } as unknown as Window,
  };
}

function node(id: string, x: number, y: number): ScatterNode {
  return { id, basenameKey: id, title: id, path: `${id}.md`, x, y, placed: true, type: "concept", latexFormulas: [], links: [], content: id };
}

function setup() {
  let w = fakeWindow();
  const handlers: Record<string, Handler> = {};
  const classes: string[] = [];
  let migrate: ((win: Window) => void) | null = null;
  const canvas = {
    win: w.win,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    addEventListener: (t: string, fn: Handler) => (handlers[t] = fn),
    removeEventListener: () => undefined,
    addClass: (c: string) => classes.push(`+${c}`),
    removeClass: (c: string) => classes.push(`-${c}`),
    onWindowMigrated: (fn: (win: Window) => void) => ((migrate = fn), () => (migrate = null)),
  };
  const nodes = [node("a", 0, 0), node("b", 100, 0), node("c", 0, 100)];
  const edgeAB: RelationEdge = { srcId: "a", tgtId: "b", relType: "IMPLIES", desc: "", title: "", path: "r.md", bidirectional: false };
  const opened: string[] = [];
  const edited: RelationEdge[] = [];
  const focused: string[] = [];
  let selectionUpdates = 0;
  const hover = { text: "" };
  const ctx = {
    app: {
      vault: { getAbstractFileByPath: (p: string) => Object.assign(new (TFile as any)(), { path: p }) },
      workspace: { getLeaf: () => ({ openFile: async (f: { path: string }) => void opened.push(f.path) }) },
    },
    settings: { language: "en" },
    zoom: 2,
    pan: { x: 50, y: 40 },
    nodes,
    selectedNodeIds: new Set<string>(),
    interaction: { isDraggingPan: false, isDraggingLasso: false, dragStart: { x: 0, y: 0 }, lassoPath: [] as { x: number; y: number }[], lassoSelectMode: false },
    hoveredNode: null as ScatterNode | null,
    hoveredEdge: null as RelationEdge | null,
    showEdges: true,
    redraw: vi.fn(),
    getVisibleNodes: () => nodes,
    hitTest(x: number, y: number) {
      return hitTest(nodes, x, y, this.zoom, this.pan);
    },
    hitTestEdge: (x: number, y: number) => (Math.abs(y - 40) < 3 && x > 80 && x < 220 ? edgeAB : null),
    focusSidebar: (n: ScatterNode) => void focused.push(n.id),
    editRelationEdge: (e: RelationEdge) => void edited.push(e),
  };
  const wrap = { clientWidth: 800, clientHeight: 600 };
  const hoverBar = { setText: (t: string) => (hover.text = t) };
  wireCanvasInteraction(ctx as unknown as ScatterViewContext, {
    canvas: canvas as unknown as HTMLCanvasElement,
    canvasWrap: wrap as unknown as HTMLElement,
    hoverBar: hoverBar as unknown as HTMLElement,
    updateSelectionUI: () => void selectionUpdates++,
  });
  // Screen position of a node in the transformed view
  const at = (n: ScatterNode) => ({ clientX: n.x * ctx.zoom + ctx.pan.x, clientY: n.y * ctx.zoom + ctx.pan.y });
  const ev = (e: Record<string, unknown> = {}) => ({ preventDefault() {}, shiftKey: false, metaKey: false, ctrlKey: false, ...e });
  return {
    ctx, nodes, handlers, classes, opened, edited, focused, hover, at, ev,
    get selectionUpdates() { return selectionUpdates; },
    get w() { return w; },
    migrate() {
      const next = fakeWindow();
      canvas.win = next.win;
      migrate?.(next.win);
      w = next;
    },
  };
}

describe("canvas interaction flows (#77)", () => {
  it("lasso in a panned and zoomed view selects the enclosed nodes and the next click keeps them", () => {
    const h = setup();
    const { a, b } = { a: h.at(h.nodes[0]), b: h.at(h.nodes[1]) };
    h.handlers.mousedown(h.ev({ clientX: a.clientX - 10, clientY: a.clientY - 10, shiftKey: true }));
    expect(h.ctx.interaction.isDraggingLasso).toBe(true);
    for (const p of [[b.clientX + 10, a.clientY - 10], [b.clientX + 10, a.clientY + 10], [a.clientX - 10, a.clientY + 10]]) {
      h.handlers.mousemove(h.ev({ clientX: p[0], clientY: p[1] }));
    }
    h.w.fire("mouseup");
    expect([...h.ctx.selectedNodeIds].sort()).toEqual(["a", "b"]);
    expect(h.ctx.interaction.lassoPath).toEqual([]);
    expect(h.ctx.interaction.isDraggingLasso).toBe(false);
    h.handlers.click(h.ev({ clientX: 700, clientY: 500 }));
    expect([...h.ctx.selectedNodeIds].sort()).toEqual(["a", "b"]);
  });

  it("a second lasso in lasso mode adds to the selection", () => {
    const h = setup();
    h.ctx.interaction.lassoSelectMode = true;
    h.ctx.selectedNodeIds.add("b");
    const c = h.at(h.nodes[2]);
    h.handlers.mousedown(h.ev({ clientX: c.clientX - 10, clientY: c.clientY - 10 }));
    for (const p of [[c.clientX + 10, c.clientY - 10], [c.clientX + 10, c.clientY + 10], [c.clientX - 10, c.clientY + 10]]) h.handlers.mousemove(h.ev({ clientX: p[0], clientY: p[1] }));
    h.w.fire("mouseup");
    expect([...h.ctx.selectedNodeIds].sort()).toEqual(["b", "c"]);
  });

  it("plain click replaces, modifier click toggles, empty click clears; hover sets the hover bar", () => {
    const h = setup();
    h.handlers.mousemove(h.ev(h.at(h.nodes[1])));
    expect(h.ctx.hoveredNode?.id).toBe("b");
    expect(h.hover.text).toBe("b");
    h.handlers.mousedown(h.ev(h.at(h.nodes[0])));
    h.w.fire("mouseup");
    h.handlers.click(h.ev(h.at(h.nodes[0])));
    expect([...h.ctx.selectedNodeIds]).toEqual(["a"]);
    h.handlers.click(h.ev({ ...h.at(h.nodes[1]), metaKey: true }));
    expect([...h.ctx.selectedNodeIds]).toEqual(["a", "b"]);
    h.handlers.click(h.ev({ ...h.at(h.nodes[0]), shiftKey: true }));
    expect([...h.ctx.selectedNodeIds]).toEqual(["b"]);
    h.handlers.click(h.ev(h.at(h.nodes[1])));
    expect([...h.ctx.selectedNodeIds]).toEqual(["b"]);
    expect(h.focused).toEqual(["a", "b", "a", "b"]);
    h.handlers.click(h.ev({ clientX: 700, clientY: 590 }));
    expect(h.ctx.selectedNodeIds.size).toBe(0);
    h.handlers.mousemove(h.ev({ clientX: 700, clientY: 590 }));
    expect(h.ctx.hoveredNode).toBe(null);
    expect(h.hover.text).not.toBe("b");
  });

  it("clicking an edge opens its editor; double click centers a node and opens its file", () => {
    const h = setup();
    h.handlers.click(h.ev({ clientX: 150, clientY: 40 }));
    expect(h.edited.map((e) => e.path)).toEqual(["r.md"]);
    h.handlers.dblclick(h.ev(h.at(h.nodes[2])));
    expect(h.ctx.pan).toEqual({ x: 400 - 0 * 2, y: 300 - 100 * 2 });
    expect(h.opened).toEqual(["c.md"]);
    expect(h.ctx.redraw).toHaveBeenCalled();
  });

  it("panning tracks the mouse; a release outside the canvas and after a window move ends it", () => {
    const h = setup();
    h.handlers.mousedown(h.ev({ clientX: 300, clientY: 300 }));
    expect(h.ctx.interaction.isDraggingPan).toBe(true);
    h.handlers.mousemove(h.ev({ clientX: 330, clientY: 280 }));
    expect(h.ctx.pan).toEqual({ x: 80, y: 20 });
    h.w.fire("mouseup");
    expect(h.ctx.interaction.isDraggingPan).toBe(false);
    h.handlers.click(h.ev({ clientX: 330, clientY: 280 }));
    expect(h.ctx.selectedNodeIds.size).toBe(0);

    h.ctx.interaction.lassoSelectMode = true;
    h.ctx.interaction.isDraggingPan = true; // a pan that started before switching to lasso mode
    h.migrate();
    h.w.fire("mouseup");
    expect(h.ctx.interaction.isDraggingPan).toBe(false);
    expect(h.classes).toEqual(["+is-grabbing", "-is-grabbing", "-is-crosshair", "-is-grabbing", "+is-crosshair"]);
  });
});
