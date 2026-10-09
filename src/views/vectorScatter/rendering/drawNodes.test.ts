import { describe, expect, it } from "vitest";
import { drawNodes } from "./drawNodes";
import { createLabelPlacer } from "./labelPlacement";
import type { ScatterNode } from "../types";
import type { RelationTally } from "../relatedNodes";

/** Minimal 2D context recording only what the label pass needs and does. */
function fakeCtx(charWidth = 8) {
  const drawnLabels: { text: string; x: number; y: number }[] = [];
  const ctx = {
    drawnLabels,
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    globalAlpha: 1,
    textAlign: "",
    textBaseline: "",
    save() {},
    restore() {},
    beginPath() {},
    arc() {},
    fill() {},
    stroke() {},
    measureText: (text: string) => ({ width: text.length * charWidth }),
    fillText: (text: string, x: number, y: number) => drawnLabels.push({ text, x, y }),
    createLinearGradient: () => ({ addColorStop() {} }),
  };
  return ctx as unknown as CanvasRenderingContext2D & { drawnLabels: typeof drawnLabels };
}

function node(id: string, x: number, y: number): ScatterNode {
  return { id, basenameKey: id, title: id, type: "definition", path: `${id}.md`, x, y, latexFormulas: [], links: [], content: "" };
}

const pan = { x: 0, y: 0 };

function render(
  nodes: ScatterNode[],
  selected: Set<string> = new Set(),
  hovered: ScatterNode | null = null,
  tallies: Map<string, RelationTally> = new Map()
) {
  const ctx = fakeCtx();
  drawNodes(ctx, nodes, selected, hovered, 1, pan, "#fff", "#999", "#0af", "monochrome", tallies, 0.35, createLabelPlacer());
  return ctx.drawnLabels.map((l) => l.text);
}

describe("drawNodes label decluttering (PR #130)", () => {
  it("draws both labels when they do not overlap", () => {
    expect(render([node("alpha", 0, 0), node("beta", 600, 600)]).sort()).toEqual(["alpha", "beta"]);
  });

  it("drops the second of two labels stacked on the same spot", () => {
    const drawn = render([node("alpha", 0, 0), node("beta", 0, 0)]);
    expect(drawn).toEqual(["alpha"]);
  });

  it("keeps the selected node's label even when an unselected label sits there first", () => {
    // "alpha" comes first in node order and would reserve the spot under a single-pass
    // placement, forcing the selected label to draw on top of it.
    const nodes = [node("alpha", 0, 0), node("selected", 0, 0)];
    const drawn = render(nodes, new Set(["selected"]));
    expect(drawn).toContain("selected");
    // The unselected one yields instead, so no two labels share the spot.
    expect(drawn).toEqual(["selected"]);
  });

  it("keeps the hovered node's label ahead of an earlier unselected node", () => {
    const hoveredNode = node("hovered", 0, 0);
    const drawn = render([node("alpha", 0, 0), hoveredNode], new Set(), hoveredNode);
    expect(drawn).toEqual(["hovered"]);
  });

  it("keeps a tallied (connected) node's label ahead of an unrelated one", () => {
    const tallies = new Map<string, RelationTally>([["tallied", { wikilink: 1, typed: 0 }]]);
    const drawn = render([node("alpha", 0, 0), node("tallied", 0, 0)], new Set(), null, tallies);
    expect(drawn).toEqual(["tallied"]);
  });

  it("draws every focus label even when two of them collide, because the user picked each one", () => {
    const a = node("selectedA", 0, 0);
    const b = node("selectedB", 0, 0);
    const drawn = render([a, b], new Set(["selectedA", "selectedB"]));
    expect(drawn.sort()).toEqual(["selectedA", "selectedB"]);
  });

  it("never draws a connected neighbor's label over the focused label (#138)", () => {
    const tallies = new Map<string, RelationTally>([["neighbor", { wikilink: 1, typed: 0 }]]);
    // The neighbor comes first in node order, so array order alone would let it reserve the spot.
    const drawn = render([node("neighbor", 0, 0), node("selected", 0, 0)], new Set(["selected"]), null, tallies);
    expect(drawn).toEqual(["selected"]);
  });

  it("keeps the hovered label ahead of a colliding connected neighbor (#138)", () => {
    const hoveredNode = node("hovered", 0, 0);
    const tallies = new Map<string, RelationTally>([["neighbor", { wikilink: 0, typed: 1 }]]);
    const drawn = render([node("neighbor", 0, 0), hoveredNode], new Set(), hoveredNode, tallies);
    expect(drawn).toEqual(["hovered"]);
  });

  it("does not stack two colliding connected neighbor labels (#138)", () => {
    const tallies = new Map<string, RelationTally>([
      ["neighborA", { wikilink: 1, typed: 0 }],
      ["neighborB", { wikilink: 1, typed: 0 }],
    ]);
    const drawn = render([node("neighborA", 0, 0), node("neighborB", 0, 0)], new Set(), null, tallies);
    expect(drawn).toHaveLength(1);
  });

  it("still draws a connected neighbor label that does not collide with the focus (#138)", () => {
    const tallies = new Map<string, RelationTally>([["neighbor", { wikilink: 1, typed: 0 }]]);
    const drawn = render([node("neighbor", 0, 400), node("selected", 0, 0)], new Set(["selected"]), null, tallies);
    expect(drawn.sort()).toEqual(["neighbor", "selected"]);
  });

  it("hides all labels below the zoom threshold unless a node is focused", () => {
    const ctx = fakeCtx();
    drawNodes(ctx, [node("alpha", 0, 0)], new Set(), null, 0.1, pan, "#fff", "#999", "#0af", "monochrome", new Map(), 0.35, createLabelPlacer());
    expect(ctx.drawnLabels).toEqual([]);

    const focusedCtx = fakeCtx();
    drawNodes(focusedCtx, [node("alpha", 0, 0)], new Set(["alpha"]), null, 0.1, pan, "#fff", "#999", "#0af", "monochrome", new Map(), 0.35, createLabelPlacer());
    expect(focusedCtx.drawnLabels.map((l) => l.text)).toEqual(["alpha"]);
  });

  it("truncates a long title only for unfocused nodes at low zoom", () => {
    const long = node("a-really-long-note-title-here", 0, 0);
    const ctx = fakeCtx();
    drawNodes(ctx, [long], new Set(), null, 1, pan, "#fff", "#999", "#0af", "monochrome", new Map(), 0.35, createLabelPlacer());
    expect(ctx.drawnLabels[0].text).toBe("a-really-long-note-t…");

    const selectedCtx = fakeCtx();
    drawNodes(selectedCtx, [long], new Set([long.id]), null, 1, pan, "#fff", "#999", "#0af", "monochrome", new Map(), 0.35, createLabelPlacer());
    expect(selectedCtx.drawnLabels[0].text).toBe("a-really-long-note-title-here");
  });

  it("respects rects already reserved by cluster labels", () => {
    const placer = createLabelPlacer();
    const ctx = fakeCtx();
    const target = node("alpha", 0, 0);
    // Reserve the exact area the label would occupy (y = 13 for zoom 1, fontH 10).
    placer.tryPlace({ x1: -100, x2: 100, y1: 10, y2: 30 }, true);
    drawNodes(ctx, [target], new Set(), null, 1, pan, "#fff", "#999", "#0af", "monochrome", new Map(), 0.35, placer);
    expect(ctx.drawnLabels).toEqual([]);
  });

  describe("viewport culling (Issue #158)", () => {
    it("skips rendering dots and labels for nodes outside viewport bounds", () => {
      const ctx = fakeCtx();
      const inside = node("inside", 100, 100);
      const outside = node("outside", 2000, 2000);
      const vp = { minX: 0, maxX: 500, minY: 0, maxY: 500 };

      drawNodes(ctx, [inside, outside], new Set(), null, 1, pan, "#fff", "#999", "#0af", "monochrome", new Map(), 0.35, createLabelPlacer(), vp);

      expect(ctx.drawnLabels.map((l) => l.text)).toEqual(["inside"]);
    });

    it("renders all nodes when viewport parameter is omitted for backward compatibility", () => {
      const ctx = fakeCtx();
      const a = node("a", 100, 100);
      const b = node("b", 2000, 2000);

      drawNodes(ctx, [a, b], new Set(), null, 1, pan, "#fff", "#999", "#0af", "monochrome", new Map(), 0.35, createLabelPlacer());

      expect(ctx.drawnLabels.map((l) => l.text).sort()).toEqual(["a", "b"]);
    });
  });
});
