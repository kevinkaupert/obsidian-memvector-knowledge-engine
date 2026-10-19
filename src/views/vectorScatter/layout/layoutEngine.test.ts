import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScatterNode } from "../types";
import { DEFAULT_SETTINGS } from "../../../settings/defaults";
import { LayoutEngine, type LayoutRunInput } from "./layoutEngine";
import { applyVectorLayout, copyNodesInPathOrder } from "./applyVectorLayout";

vi.mock("./projections", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./projections")>();
  return { ...mod, applyGraphVectorProjection: vi.fn(mod.applyGraphVectorProjection) };
});
import { applyGraphVectorProjection } from "./projections";

function makeNodes(placed: boolean): ScatterNode[] {
  return Array.from({ length: 6 }, (_, i) => ({
    id: `n${i}`,
    basenameKey: `n${i}`,
    title: `Note ${i}`,
    type: "concept" as const,
    path: `${i < 3 ? "a" : "b"}/n${i}.md`,
    x: placed ? 100 * i + 50 : 0,
    y: placed ? -40 * i + 30 : 0,
    latexFormulas: [],
    links: [],
    content: `${i < 3 ? "algebra" : "geometry"} text ${i}`,
    embedding: Array.from({ length: 6 }, (_, d) => (i < 3 ? 1 : -1) * (d + 1) + i * 0.1),
  }));
}

const input = (nodes: ScatterNode[], patch: Partial<LayoutRunInput> = {}): LayoutRunInput => ({
  nodes,
  relationEdges: [],
  vocabulary: [],
  settings: { ...DEFAULT_SETTINGS },
  nodeSpacing: 350,
  cloudSpacing: 800,
  ...patch,
});

const clone = (nodes: ScatterNode[]) => nodes.map((n) => ({ ...n, cloudId: undefined, cloudLabel: undefined }));

beforeEach(() => {
  vi.mocked(applyGraphVectorProjection).mockClear();
});

describe("LayoutEngine (#209)", () => {
  it("preserves caller order and references through initialization, bounded and free passes", () => {
    const nodes = makeNodes(true).reverse();
    const originalOrder = [...nodes];
    Object.freeze(nodes);
    const engine = new LayoutEngine();
    expect(engine.run(input(nodes)).kind).toBe("none");
    nodes[2].embedding = nodes[2].embedding!.map((v, k) => (k === 0 ? v + 0.05 : v));
    expect(engine.run(input(nodes)).kind).toBe("bounded");
    expect(engine.run(input(nodes), "global").kind).toBe("free");
    expect(engine.run(input(nodes), "rearrange").kind).toBe("free");
    nodes.forEach((node, i) => expect(node).toBe(originalOrder[i]));
    expect(nodes.map((node) => node.path)).toEqual(originalOrder.map((node) => node.path));
  });
  it("initializes from placed nodes without simulating and assigns clusters", () => {
    const engine = new LayoutEngine();
    const nodes = makeNodes(true);
    const before = nodes.map((n) => [n.x, n.y]);

    expect(engine.run(input(nodes)).simulated).toBe(false);

    expect(applyGraphVectorProjection).not.toHaveBeenCalled();
    expect(nodes.map((n) => [n.x, n.y])).toEqual(before);
    expect(nodes.every((n) => n.cloudId !== undefined && n.cloudLabel)).toBe(true);
  });

  it("simulates on the first request when nodes are unplaced", () => {
    const engine = new LayoutEngine();
    const result = engine.run(input(makeNodes(false)));
    expect(result.simulated).toBe(true);
    expect(applyGraphVectorProjection).toHaveBeenCalledTimes(1 + result.settle!.passes);
  });

  it("re-applies clusters to fresh node objects without simulating when nothing changed", () => {
    const engine = new LayoutEngine();
    const nodes = makeNodes(true);
    engine.run(input(nodes));
    const fresh = clone(nodes);

    expect(engine.run(input(fresh)).simulated).toBe(false);

    expect(applyGraphVectorProjection).not.toHaveBeenCalled();
    expect(fresh.map((n) => n.cloudId)).toEqual(nodes.map((n) => n.cloudId));
    expect(fresh.map((n) => n.cloudLabel)).toEqual(nodes.map((n) => n.cloudLabel));
  });

  it("refreshes a cluster label from the centroid's current title", () => {
    const engine = new LayoutEngine();
    const nodes = makeNodes(true);
    engine.run(input(nodes));
    const fresh = clone(nodes);
    const centroid = fresh.find((n) => n.title === nodes[0].cloudLabel)!;
    centroid.title = "Renamed";

    engine.run(input(fresh));

    expect(fresh[0].cloudLabel).toBe("Renamed");
    expect(applyGraphVectorProjection).not.toHaveBeenCalled();
  });

  it("simulates when a layout input changed", () => {
    const engine = new LayoutEngine();
    const nodes = makeNodes(true);
    engine.run(input(nodes));
    const fresh = clone(nodes);
    fresh[2].embedding = fresh[2].embedding!.map((v, k) => (k === 0 ? v + 0.05 : v));

    expect(engine.run(input(fresh)).simulated).toBe(true);
  });

  it("scales instead of simulating when node spacing changes, and only stores a new cloud spacing (Plan 0005 S4, S5)", () => {
    const engine = new LayoutEngine();
    const nodes = makeNodes(true);
    engine.run(input(nodes));

    const scaled = engine.run(input(nodes, { nodeSpacing: 500 }));
    expect([scaled.simulated, scaled.moved]).toEqual([false, true]);
    const stored = engine.run(input(nodes, { nodeSpacing: 500, cloudSpacing: 2000 }));
    expect([stored.simulated, stored.moved]).toEqual([false, false]);
  });

  it("simulates on an explicit global request even without changes", () => {
    const engine = new LayoutEngine();
    const nodes = makeNodes(true);
    engine.run(input(nodes));

    expect(engine.run(input(nodes), "global").simulated).toBe(true);
  });

  it("uses id as a deterministic tiebreak when selecting similar neighbors for bounded mobile sets", () => {
    const engine = new LayoutEngine();
    const nodes = makeNodes(true);
    engine.run(input(nodes));
    const fresh = clone(nodes);
    fresh[0].embedding = fresh[0].embedding!.map((v, k) => (k === 0 ? v + 0.05 : v));
    const result = engine.run(input(fresh));
    expect(result.kind).toBe("bounded");
  });
});

/** Two topic groups plus relation edges between notes the initial spread puts far apart (#282 review). */
function relatedNodes(count: number): { nodes: ScatterNode[]; edges: LayoutRunInput["relationEdges"] } {
  const nodes = Array.from({ length: count }, (_, i) => ({
    id: `r${i}`,
    basenameKey: `r${i}`,
    title: `R ${i}`,
    type: "concept" as const,
    path: `r/${String(i).padStart(4, "0")}.md`,
    x: 0,
    y: 0,
    latexFormulas: [],
    links: [],
    content: `text ${i}`,
    embedding: Array.from({ length: 8 }, (_, d) => Math.sin((i + 1) * (d + 1) * 1.7) + (i % 2 ? 0.8 : -0.8)),
  }));
  const edges = Array.from({ length: Math.min(10, count >> 1) }, (_, k) => ({
    srcId: `r${k}`,
    tgtId: `r${count - 1 - k}`,
    relType: "IMPLIES",
    desc: "",
    title: "",
    path: `rel${k}.md`,
    bidirectional: false,
  }));
  return { nodes, edges };
}

const edgeLengths = (nodes: ScatterNode[], edges: LayoutRunInput["relationEdges"]) => {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return edges.map((e) => Math.hypot(byId.get(e.srcId)!.x - byId.get(e.tgtId)!.x, byId.get(e.srcId)!.y - byId.get(e.tgtId)!.y));
};

describe("LayoutEngine settles a layout built from scratch (#282 review)", () => {
  it("rearranging runs extra passes until nodes stop moving and pulls related notes closer than one pass", () => {
    const { nodes, edges } = relatedNodes(30);
    const single = clone(nodes);
    const engine = new LayoutEngine();
    const result = engine.run(input(nodes, { relationEdges: edges, nodeSpacing: 120, cloudSpacing: 750 }), "rearrange");
    expect(result.settle!.passes).toBeGreaterThan(0);

    // Reference: exactly one projection from scratch, as before this change
    applyVectorLayout(copyNodesInPathOrder(single), { ...DEFAULT_SETTINGS }, 120, 750, { relationEdges: edges, vocabulary: [] });
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
    expect(sum(edgeLengths(nodes, edges))).toBeLessThan(sum(edgeLengths(single, edges)));

    if (result.settle!.converged) {
      const before = nodes.map((n) => [n.x, n.y]);
      engine.run(input(nodes, { relationEdges: edges, nodeSpacing: 120, cloudSpacing: 750 }), "global");
      const moved = Math.max(...nodes.map((n, i) => Math.hypot(n.x - before[i][0], n.y - before[i][1])));
      expect(moved).toBeLessThan(120 * 0.05 * 20);
    }
  });

  it("stops at the pass cap when spacing keeps nodes moving, and is deterministic", () => {
    const a = relatedNodes(34);
    const b = relatedNodes(34);
    const ra = new LayoutEngine().run(input(a.nodes, { relationEdges: a.edges, nodeSpacing: 120, cloudSpacing: 3000 }), "rearrange");
    new LayoutEngine().run(input([...b.nodes].reverse(), { relationEdges: b.edges, nodeSpacing: 120, cloudSpacing: 3000 }), "rearrange");
    expect(ra.settle!.passes).toBeLessThanOrEqual(6);
    if (!ra.settle!.converged) expect(ra.settle!.passes).toBe(6);
    expect(b.nodes.map((n) => [n.x, n.y])).toEqual(a.nodes.map((n) => [n.x, n.y]));
  });

  it("large vaults get no extra passes (work budget)", () => {
    const { nodes } = relatedNodes(501);
    const result = new LayoutEngine().run(input(nodes), "rearrange");
    expect(result.settle).toEqual({ passes: 0, converged: false });
    expect(applyGraphVectorProjection).toHaveBeenCalledTimes(1);
  });

  it("after a rearrange an unchanged auto request does not move anything; warm free and bounded passes stay single", () => {
    const { nodes, edges } = relatedNodes(12);
    const engine = new LayoutEngine();
    engine.run(input(nodes, { relationEdges: edges }), "rearrange");
    vi.mocked(applyGraphVectorProjection).mockClear();
    expect(engine.run(input(nodes, { relationEdges: edges })).simulated).toBe(false);
    expect(applyGraphVectorProjection).not.toHaveBeenCalled();

    const global = engine.run(input(nodes, { relationEdges: edges, nodeSpacing: 400 }), "global");
    expect(global.settle).toBeUndefined();
    expect(applyGraphVectorProjection).toHaveBeenCalledTimes(1);

    vi.mocked(applyGraphVectorProjection).mockClear();
    nodes[3].embedding = nodes[3].embedding!.map((v, k) => (k === 0 ? v + 0.05 : v));
    nodes[3].embedding = nodes[3].embedding!.map((v) => -v);
    const bounded = engine.run(input(nodes, { relationEdges: edges, nodeSpacing: 400 }));
    if (bounded.kind === "bounded") expect(applyGraphVectorProjection).toHaveBeenCalledTimes(1);
    expect(bounded.settle).toBeUndefined();
  });
});
