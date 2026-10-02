import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScatterNode } from "../types";
import { DEFAULT_SETTINGS } from "../../../settings/defaults";
import { LayoutEngine, type LayoutRunInput } from "./layoutEngine";

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
    nodes[2].content = "changed geometry words";
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
    expect(engine.run(input(makeNodes(false))).simulated).toBe(true);
    expect(applyGraphVectorProjection).toHaveBeenCalledTimes(1);
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
    fresh[2].content = "completely different words";

    expect(engine.run(input(fresh)).simulated).toBe(true);
  });

  it("simulates when the spacing changes, as the sliders do", () => {
    const engine = new LayoutEngine();
    const nodes = makeNodes(true);
    engine.run(input(nodes));

    expect(engine.run(input(nodes, { nodeSpacing: 500 })).simulated).toBe(true);
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
    fresh[0].content = "modified content to trigger bounded";
    const result = engine.run(input(fresh));
    expect(result.kind).toBe("bounded");
  });
});
