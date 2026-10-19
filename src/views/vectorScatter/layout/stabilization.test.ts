/**
 * Purpose: Step 3 of Plan 0005 (#284): stabilization rules of the layout engine. S1 relation changes stay bounded,
 * S3 untouched notes move at most NEIGHBOR_MOVE_LIMIT x node spacing per bounded pass, S4 node spacing scales the map,
 * S5 cloud spacing waits for an explicit rearrange. S2 (filter as visibility) is tested on the view.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../../settings/defaults";
import type { RelationTermDef } from "../../../relationVocabulary/types";
import type { RelationEdge, ScatterNode } from "../types";
import { LayoutEngine, type LayoutMode } from "./layoutEngine";
import { NEIGHBOR_MOVE_LIMIT } from "./layoutTunables";

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function vault(topics: number, perTopic: number, seed = 11): ScatterNode[] {
  const r = rng(seed);
  const nodes: ScatterNode[] = [];
  for (let t = 0; t < topics; t++) {
    for (let i = 0; i < perTopic; i++) {
      const id = `t${t}n${i}`;
      nodes.push({
        id, basenameKey: id, title: id, type: "concept", path: `${id}.md`, x: 0, y: 0, latexFormulas: [], links: [],
        content: `${id} topic${t}`,
        embedding: Array.from({ length: 8 }, (_, d) => (d % 4 === t ? 1 : 0.05) + (r() - 0.5) * 0.1),
      });
    }
  }
  return nodes;
}

const VOCAB = [{ label: "W3", weight: 3 } as RelationTermDef];
const rel = (a: string, b: string): RelationEdge => ({ srcId: a, tgtId: b, relType: "W3", desc: "", title: "", path: `r-${a}-${b}.md`, bidirectional: false });

function run(engine: LayoutEngine, nodes: ScatterNode[], edges: RelationEdge[], mode: LayoutMode = "auto", nodeSpacing = 350, cloudSpacing = 800) {
  return engine.run({ nodes, relationEdges: edges, vocabulary: VOCAB, settings: { ...DEFAULT_SETTINGS }, nodeSpacing, cloudSpacing }, mode);
}

const snapshot = (nodes: ScatterNode[]) => new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
const moved = (before: Map<string, { x: number; y: number }>, n: ScatterNode) => Math.hypot(n.x - before.get(n.id)!.x, n.y - before.get(n.id)!.y);

describe("S1 relation changes from the relation builder stay bounded", () => {
  it("runs a bounded pass for a relation added in a three-note vault, which 'auto' turns into a free pass", () => {
    const nodes = vault(3, 1);
    const engine = new LayoutEngine();
    run(engine, nodes, [], "rearrange");
    expect(run(engine, nodes, [rel("t0n0", "t1n0")], "relations").kind).toBe("bounded");
  });

  it("runs a bounded pass for a deleted relation", () => {
    const nodes = vault(3, 6);
    const edges = [rel("t0n0", "t1n0"), rel("t1n1", "t2n1")];
    const engine = new LayoutEngine();
    run(engine, nodes, edges, "rearrange");
    expect(run(engine, nodes, edges.slice(1), "relations").kind).toBe("bounded");
  });
});

describe("bounded passes without semantic bounds (Plan 0005 step 4 review)", () => {
  it("keeps a relation change bounded in a vault without vectors", () => {
    const nodes = vault(3, 4).map((n) => ({ ...n, embedding: undefined }));
    const engine = new LayoutEngine();
    run(engine, nodes, [rel("t0n0", "t0n1")], "rearrange");
    expect(run(engine, nodes, [rel("t0n0", "t0n1"), rel("t1n0", "t2n0")], "relations").kind).toBe("bounded");
  });
});

describe("semantic bounds once vectors arrive (Plan 0005 step 4 review)", () => {
  it("derives the bounds when the vault gains vectors after a layout without them, and keeps them afterwards", () => {
    const withVectors = vault(3, 4);
    const nodes = withVectors.map((n) => ({ ...n, embedding: undefined }));
    const engine = new LayoutEngine();
    run(engine, nodes, [], "rearrange");
    expect((engine as any).model.bounds).toBeNull();
    // Vectors arrive one note at a time, as with background indexing: every update is a bounded pass.
    nodes.forEach((n, i) => {
      n.embedding = withVectors[i].embedding;
      expect(run(engine, nodes, []).kind).not.toBe("free");
    });
    const bounds = (engine as any).model.bounds;
    expect(bounds).not.toBeNull();
    nodes[0].embedding = nodes[0].embedding!.map((v) => v * 0.5 + 0.1);
    run(engine, nodes, []);
    expect((engine as any).model.bounds).toEqual(bounds);
  });
});

describe("S3 hard movement bound for untouched notes", () => {
  it("moves no note other than the changed one further than NEIGHBOR_MOVE_LIMIT x node spacing", () => {
    const nodes = vault(3, 6);
    const engine = new LayoutEngine();
    run(engine, nodes, [], "rearrange");
    const before = snapshot(nodes);
    // A note that jumps to another topic pulls its new neighbors hard.
    const changed = nodes.find((n) => n.id === "t2n3")!;
    changed.embedding = nodes.find((n) => n.id === "t0n0")!.embedding!.map((v) => v * 1.01);
    expect(run(engine, nodes, []).kind).toBe("bounded");
    const limit = NEIGHBOR_MOVE_LIMIT * 350 + 1e-9;
    for (const n of nodes) if (n.id !== "t2n3") expect(moved(before, n)).toBeLessThanOrEqual(limit);
  });
});

describe("S4 node spacing scales the map", () => {
  it("scales every position by new / old without simulating and reports moved positions", () => {
    const nodes = vault(3, 4);
    const engine = new LayoutEngine();
    run(engine, nodes, [], "rearrange");
    const before = snapshot(nodes);
    const result = run(engine, nodes, [], "auto", 500);
    expect(result.simulated).toBe(false);
    expect(result.moved).toBe(true);
    for (const n of nodes) {
      expect(n.x).toBeCloseTo((before.get(n.id)!.x * 500) / 350, 9);
      expect(n.y).toBeCloseTo((before.get(n.id)!.y * 500) / 350, 9);
    }
  });

  it("applies one change once: the next run with the same spacing moves nothing", () => {
    const nodes = vault(3, 4);
    const engine = new LayoutEngine();
    run(engine, nodes, [], "rearrange");
    run(engine, nodes, [], "auto", 500);
    const before = snapshot(nodes);
    expect(run(engine, nodes, [], "auto", 500).kind).toBe("none");
    for (const n of nodes) expect(moved(before, n)).toBe(0);
  });
});

describe("S5 cloud spacing waits for an explicit rearrange", () => {
  it("moves nothing when only cloud spacing changed, and a later bounded pass still uses the applied value", () => {
    const a = vault(3, 6);
    const b = vault(3, 6);
    const ea = new LayoutEngine();
    const eb = new LayoutEngine();
    run(ea, a, [], "rearrange");
    run(eb, b, [], "rearrange");
    const before = snapshot(b);
    expect(run(eb, b, [], "auto", 350, 3000).kind).toBe("none");
    for (const n of b) expect(moved(before, n)).toBe(0);
    // The same edit in both vaults: with the cloud spacing still applied at 800, the result is identical.
    for (const nodes of [a, b]) { const edited = nodes.find((n) => n.id === "t1n2")!; edited.embedding = edited.embedding!.map((v, k) => (k === 0 ? v + 0.05 : v)); };
    run(ea, a, [], "auto", 350, 800);
    run(eb, b, [], "auto", 350, 3000);
    expect(snapshot(b)).toEqual(snapshot(a));
  });

  it("applies the stored cloud spacing at the next rearrange", () => {
    const a = vault(4, 1);
    const b = vault(4, 1);
    const ea = new LayoutEngine();
    const eb = new LayoutEngine();
    run(ea, a, [], "rearrange", 350, 3000);
    run(eb, b, [], "rearrange", 350, 800);
    run(eb, b, [], "auto", 350, 3000);
    run(eb, b, [], "rearrange", 350, 3000);
    expect(snapshot(b)).toEqual(snapshot(a));
  });
});
