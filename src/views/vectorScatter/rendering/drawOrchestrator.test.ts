/**
 * Purpose: Characterization of a full 2D view frame (#76): every canvas call of draw() for typical states, recorded
 * before drawNodes/drawEdges took an options object. The refactor must produce the same call logs.
 */
import { describe, expect, it } from "vitest";
import type { RelationEdge, ScatterNode } from "../types";
import { draw, type DrawState } from "./drawOrchestrator";

function recordingContext() {
  const log: string[] = [];
  const fmt = (v: unknown) => (typeof v === "number" ? String(Math.round(v * 1000) / 1000) : typeof v === "object" && v !== null ? JSON.stringify(v) : JSON.stringify(v));
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_, key: string) {
      if (key === "measureText") return (t: string) => ({ width: t.length * 6 });
      if (key === "createRadialGradient" || key === "createLinearGradient") {
        return (...a: unknown[]) => (log.push(`${key}(${a.map(fmt).join(",")})`), { addColorStop: (o: number, c: string) => log.push(`  stop(${o},${c})`) });
      }
      return (...a: unknown[]) => log.push(`${key}(${a.map(fmt).join(",")})`);
    },
    set(_, key: string, value: unknown) {
      log.push(`${key}=${fmt(value)}`);
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log };
}

function node(id: string, x: number, y: number, extra: Partial<ScatterNode> = {}): ScatterNode {
  return { id, basenameKey: id, title: id, path: `${id}.md`, x, y, placed: true, type: "concept", latexFormulas: [], links: [], content: id, cloudId: 0, cloudLabel: "A", ...extra };
}

function edge(srcId: string, tgtId: string, relType: string, extra: Partial<RelationEdge> = {}): RelationEdge {
  return { srcId, tgtId, relType, desc: `${relType} desc`, title: "", path: `rel-${srcId}-${tgtId}.md`, bidirectional: false, ...extra };
}

const nodes = [node("a", 0, 0), node("b", 200, 50, { type: "theorem" }), node("c", -150, 120, { cloudId: 1, cloudLabel: "B" }), node("far", 5000, 5000)];
const edges = [edge("a", "b", "IMPLIES"), edge("b", "c", "CONFLICTS_WITH"), edge("a", "c", "IMPLIES", { confidence: "suggested", origin: "frontmatter" }), edge("c", "a", "RELATED_TO")];

function frame(overrides: Partial<DrawState> = {}): string[] {
  const { ctx, log } = recordingContext();
  draw(ctx, 800, 600, null, {
    nodes,
    zoom: 1,
    pan: { x: 400, y: 300 },
    projectionMode: "graphvector",
    showEdges: true,
    edgeHops: 1,
    relationEdges: edges,
    selectedNodeIds: new Set(),
    hoveredNode: null,
    hoveredEdge: null,
    isDraggingLasso: false,
    lassoPath: [],
    scatterVisualStyle: "monochrome",
    unselectedLabelOpacity: 0.35,
    ...overrides,
  });
  return log;
}

describe("draw() frames (#76)", () => {
  it("idle frame, nothing selected", () => {
    expect(frame()).toMatchSnapshot();
  });
  it("selection with one hop and a hovered edge label", () => {
    expect(frame({ selectedNodeIds: new Set(["a"]), hoveredEdge: edges[0] })).toMatchSnapshot();
  });
  it("hovered node, all hops (0), colored style, label opacity 0", () => {
    expect(frame({ hoveredNode: nodes[1], edgeHops: 0, scatterVisualStyle: "ink" as DrawState["scatterVisualStyle"], unselectedLabelOpacity: 0 })).toMatchSnapshot();
  });
  it("zoomed out with a lasso and edges hidden", () => {
    expect(frame({ zoom: 0.2, showEdges: false, isDraggingLasso: true, lassoPath: [{ x: 1, y: 1 }, { x: 50, y: 1 }, { x: 50, y: 60 }] })).toMatchSnapshot();
  });
  it("two consecutive frames with default label placement are identical", () => {
    const state = { selectedNodeIds: new Set(["b"]) };
    expect(frame(state)).toEqual(frame(state));
  });
});
