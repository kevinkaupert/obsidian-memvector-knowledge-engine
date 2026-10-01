import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScatterNode } from "../types";
import { DEFAULT_SETTINGS } from "../../../settings/defaults";
import { applyGraphVectorProjection } from "./projections";
import { prepareLayoutModel } from "./applyVectorLayout";
import { LayoutEngine, type LayoutRunInput } from "./layoutEngine";
import { isPlaced } from "../types";

/** Deterministic vault with `topics` clusters of `perTopic` notes; vectors are topic centroid plus noise. */
function makeVault(topics = 4, perTopic = 10): ScatterNode[] {
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const dim = 16;
  const centroids = Array.from({ length: topics }, () => Array.from({ length: dim }, () => rnd() - 0.5));
  const nodes: ScatterNode[] = [];
  for (let t = 0; t < topics; t++) {
    for (let k = 0; k < perTopic; k++) {
      const id = `t${t}/n${k}`;
      nodes.push({
        id,
        basenameKey: `n${k}`,
        title: id,
        type: "concept",
        path: `${id}.md`,
        x: 0,
        y: 0,
        placed: false,
        latexFormulas: [],
        links: [],
        content: `topic${t} words ${k}`,
        embedding: centroids[t].map((c) => c + (rnd() - 0.5) * 0.3),
      });
    }
  }
  return nodes;
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

const positions = (nodes: ScatterNode[]) => new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
const displacement = (before: Map<string, { x: number; y: number }>, n: ScatterNode) => {
  const b = before.get(n.id)!;
  return Math.hypot(n.x - b.x, n.y - b.y);
};

/** A settled layout: one free pass, as after opening a new vault. */
function settledVault(): { engine: LayoutEngine; nodes: ScatterNode[] } {
  const engine = new LayoutEngine();
  const nodes = makeVault();
  engine.run(input(nodes));
  return { engine, nodes };
}

describe("bounded projection (#185)", () => {
  it("never moves nodes outside the mobile set and keeps mobile ones near their previous position", () => {
    const { nodes } = settledVault();
    const before = positions(nodes);
    const model = prepareLayoutModel(nodes, { ...DEFAULT_SETTINGS }, { assignClusters: false });
    const mobileIds = new Set(["t0/n0", "t0/n1", "t1/n0"]);

    const result = applyGraphVectorProjection({ nodes, matrix: model.matrix, nodeSpacing: 350, cloudSpacing: 800, relationEdges: [], bounded: { mobileIds } });

    for (const n of nodes) {
      if (mobileIds.has(n.id)) expect(displacement(before, n)).toBeLessThan(350);
      else expect(displacement(before, n)).toBe(0);
    }
    expect(result.iterations).toBeLessThanOrEqual(60);
  });

  it("stops early once a settled layout no longer moves", () => {
    const { nodes } = settledVault();
    const model = prepareLayoutModel(nodes, { ...DEFAULT_SETTINGS }, { assignClusters: false });
    const params = { nodes, matrix: model.matrix, nodeSpacing: 350, cloudSpacing: 800, relationEdges: [], bounded: { mobileIds: new Set(nodes.map((n) => n.id)) } };
    applyGraphVectorProjection(params);
    applyGraphVectorProjection(params);
    expect(applyGraphVectorProjection(params).iterations).toBeLessThan(60);
  });

  it("seeds a new node next to its most similar placed node", () => {
    const { nodes } = settledVault();
    const twin = nodes[5];
    const fresh: ScatterNode = { ...twin, id: "new", path: "new.md", x: 0, y: 0, placed: false, cloudId: undefined };
    const all = [...nodes, fresh];
    const model = prepareLayoutModel(all, { ...DEFAULT_SETTINGS }, { assignClusters: false });

    applyGraphVectorProjection({ nodes: all, matrix: model.matrix, nodeSpacing: 350, cloudSpacing: 800, relationEdges: [], bounded: { mobileIds: new Set(["new"]) } });

    expect(Math.hypot(fresh.x - twin.x, fresh.y - twin.y)).toBeLessThan(350);
    expect(fresh.placed).toBe(true);
  });
});

describe("LayoutEngine bounded adjustment (#185)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("adjusts locally when one note changes: distant notes stay exactly where they were", () => {
    const { engine, nodes } = settledVault();
    const before = positions(nodes);
    nodes[0].embedding = nodes[0].embedding!.map((v) => v * 1.5 + 0.05);

    const result = engine.run(input(nodes));

    expect(result.kind).toBe("bounded");
    const moved = nodes.filter((n) => displacement(before, n) > 0);
    expect(moved.length).toBeGreaterThan(0);
    expect(moved.length).toBeLessThanOrEqual(1 + 5);
    const other = nodes.filter((n) => n.id.startsWith("t3/"));
    expect(other.every((n) => displacement(before, n) === 0)).toBe(true);
  });

  it("places an added note without moving more than its neighborhood, and keeps every existing cluster", () => {
    const { engine, nodes } = settledVault();
    const clusters = new Map(nodes.map((n) => [n.id, n.cloudId]));
    const before = positions(nodes);
    const fresh: ScatterNode = { ...nodes[12], id: "t1/new", path: "t1/new.md", x: 0, y: 0, placed: false, cloudId: undefined, embedding: nodes[12].embedding!.map((v) => v + 0.01) };
    nodes.push(fresh);

    expect(engine.run(input(nodes)).kind).toBe("bounded");

    expect(isPlaced(fresh)).toBe(true);
    expect(fresh.cloudId).toBe(nodes[12].cloudId);
    for (const n of nodes) if (n !== fresh) expect(n.cloudId).toBe(clusters.get(n.id));
    const movedExisting = nodes.filter((n) => n !== fresh && displacement(before, n) > 0);
    expect(movedExisting.length).toBeLessThanOrEqual(5);
  });

  it("moves the endpoints of a new relation, not the rest of the vault", () => {
    const { engine, nodes } = settledVault();
    const before = positions(nodes);
    const edges = [{ srcId: "t0/n0", tgtId: "t2/n0", relType: "REQUIRES", desc: "", title: "", path: "r.md", bidirectional: false }];

    expect(engine.run(input(nodes, { relationEdges: edges })).kind).toBe("bounded");

    expect(displacement(before, nodes.find((n) => n.id === "t0/n0")!)).toBeGreaterThan(0);
    expect(nodes.filter((n) => n.id.startsWith("t3/")).every((n) => displacement(before, n) === 0)).toBe(true);
  });

  it("falls back to a free pass when most notes changed, e.g. vectors calculated for the whole vault", () => {
    const { engine, nodes } = settledVault();
    for (const n of nodes) n.embedding = n.embedding!.map((v) => -v);
    expect(engine.run(input(nodes)).kind).toBe("free");
  });

  it("falls back to a free pass when a cluster centroid was removed", () => {
    const { engine, nodes } = settledVault();
    const centroid = nodes.findIndex((n) => n.title === nodes[0].cloudLabel);
    nodes.splice(centroid, 1);
    expect(engine.run(input(nodes)).kind).toBe("free");
  });

  it("repeated unchanged runs after a bounded adjustment move nothing", () => {
    const { engine, nodes } = settledVault();
    nodes[0].content = "other words";
    engine.run(input(nodes));
    const before = positions(nodes);
    for (let i = 0; i < 5; i++) expect(engine.run(input(nodes)).kind).toBe("none");
    expect(nodes.every((n) => displacement(before, n) === 0)).toBe(true);
  });
});

describe("placed flag (#190)", () => {
  it("keeps a node placed at exactly the origin there instead of re-seeding it", () => {
    const { engine, nodes } = settledVault();
    const origin = nodes[3];
    origin.x = 0;
    origin.y = 0;
    origin.placed = true;
    // A change in another topic: the origin node is not part of the adjustment.
    nodes.find((n) => n.id === "t3/n9")!.content = "unrelated change";

    engine.run(input(nodes));

    expect([origin.x, origin.y]).toEqual([0, 0]);
    expect(isPlaced(origin)).toBe(true);
  });

  it("falls back to the origin check for nodes without the flag", () => {
    const base = makeVault(1, 1)[0];
    expect(isPlaced({ ...base, placed: undefined, x: 0, y: 0 })).toBe(false);
    expect(isPlaced({ ...base, placed: undefined, x: 1, y: 0 })).toBe(true);
    expect(isPlaced({ ...base, placed: true, x: 0, y: 0 })).toBe(true);
  });
});
