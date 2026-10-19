/**
 * Purpose: Characterization of today's layout forces and triggers (Plan 0005 step 2, #284, #283). Records what the
 * layout does now, including behavior Plan 0005 section 7 will change (WikiLinks through the similarity, max instead
 * of sum, hops, cloud spacing as point repulsion). Distances are asserted as relations; measured values are recorded as
 * rounded inline snapshots so step 3 and 4 show exactly what changed.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../../settings/defaults";
import type { MemVectorSettings } from "../../../settings/types";
import type { RelationTermDef } from "../../../relationVocabulary/types";
import type { RelationEdge, ScatterNode } from "../types";
import { calcSimilarity, normalizeWeights } from "./similarity";
import { computeGraphTopologyWeights } from "./graphTopologyWeights";
import { LayoutEngine, type LayoutMode } from "./layoutEngine";

/** Deterministic pseudo-random numbers (LCG). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const DIMS = 8;

/** Embedding near one of four topic axes, with a little noise. */
function topicVector(topic: number, r: () => number): number[] {
  return Array.from({ length: DIMS }, (_, d) => (d % 4 === topic ? 1 : 0.05) + (r() - 0.5) * 0.1);
}

function note(id: string, topic: number, r: () => number, extra: Partial<ScatterNode> = {}): ScatterNode {
  return {
    id,
    basenameKey: id,
    title: id,
    type: "concept",
    path: `${id}.md`,
    x: 0,
    y: 0,
    latexFormulas: [],
    links: [],
    content: `${id} topic${topic}`,
    embedding: topicVector(topic, r),
    ...extra,
  };
}

/** A vault of `perTopic` notes in each of `topics` topics, named t<topic>n<i>. */
function vault(topics: number, perTopic: number, seed = 7): ScatterNode[] {
  const r = rng(seed);
  const nodes: ScatterNode[] = [];
  for (let t = 0; t < topics; t++) for (let i = 0; i < perTopic; i++) nodes.push(note(`t${t}n${i}`, t, r));
  return nodes;
}

function relation(srcId: string, tgtId: string, relType: string): RelationEdge {
  return { srcId, tgtId, relType, desc: "", title: "", path: `rel-${srcId}-${tgtId}.md`, bidirectional: false };
}

const VOCAB: RelationTermDef[] = [
  { label: "W1", weight: 1 } as RelationTermDef,
  { label: "W3", weight: 3 } as RelationTermDef,
  { label: "W6", weight: 6 } as RelationTermDef,
  { label: "CONFLICTS_WITH", repels: true } as RelationTermDef,
];

interface Run {
  nodes: ScatterNode[];
  edges?: RelationEdge[];
  settings?: Partial<MemVectorSettings>;
  nodeSpacing?: number;
  cloudSpacing?: number;
}

function layout(engine: LayoutEngine, run: Run, mode: LayoutMode = "rearrange") {
  return engine.run(
    {
      nodes: run.nodes,
      relationEdges: run.edges ?? [],
      vocabulary: VOCAB,
      settings: { ...DEFAULT_SETTINGS, ...run.settings },
      nodeSpacing: run.nodeSpacing ?? 350,
      cloudSpacing: run.cloudSpacing ?? 800,
    },
    mode
  );
}

function byId(nodes: ScatterNode[], id: string): ScatterNode {
  const found = nodes.find((n) => n.id === id);
  if (!found) throw new Error(`no node ${id}`);
  return found;
}

function dist(nodes: ScatterNode[], a: string, b: string): number {
  const na = byId(nodes, a);
  const nb = byId(nodes, b);
  return Math.hypot(na.x - nb.x, na.y - nb.y);
}

const positions = (nodes: ScatterNode[]) => new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));

function maxMove(before: Map<string, { x: number; y: number }>, nodes: ScatterNode[], ids?: Set<string>): number {
  let largest = 0;
  for (const n of nodes) {
    if (ids && !ids.has(n.id)) continue;
    const p = before.get(n.id);
    if (p) largest = Math.max(largest, Math.hypot(n.x - p.x, n.y - p.y));
  }
  return largest;
}

const round = (v: number) => Math.round(v);

describe("C1 linked pair: every path a WikiLink takes today", () => {
  const weights = normalizeWeights({ vector: 0.5, wikiLinks: 0.3, folder: 0.1, semantics: 0.1 });

  it("raises the hybrid similarity S regardless of the WikiLink setting (path 1)", () => {
    const r = rng(1);
    const a = note("a", 0, r);
    const b = note("b", 1, r);
    const plain = calcSimilarity(a, b, weights, false);
    const linked = calcSimilarity({ ...a, links: ["b"] }, b, weights, false);
    expect(linked - plain).toBeCloseTo(0.75 * 0.3, 5);
  });

  it("adds graph weight 0.7 and hop weights only with the setting on (paths 2 and 3)", () => {
    const r = rng(2);
    const nodes = [note("a", 0, r, { links: ["b"] }), note("b", 1, r, { links: ["c"] }), note("c", 2, r)];
    const off = computeGraphTopologyWeights(nodes, [], false);
    const on = computeGraphTopologyWeights(nodes, [], true);
    expect([off.conn[0][1], off.conn[0][2]]).toEqual([0.05, 0.05]);
    expect([on.conn[0][1], on.conn[0][2]]).toEqual([0.7, 0.12]);
  });

  it("pulls a linked pair closer even with the setting off, and closer still with it on", () => {
    const base = () => vault(2, 6);
    const unlinked = base();
    layout(new LayoutEngine(), { nodes: unlinked });
    const linkedOff = base();
    byId(linkedOff, "t0n0").links = ["t1n0"];
    layout(new LayoutEngine(), { nodes: linkedOff });
    const linkedOn = base();
    byId(linkedOn, "t0n0").links = ["t1n0"];
    layout(new LayoutEngine(), { nodes: linkedOn, settings: { includeWikiLinksAsRelations: true } });

    const d = [dist(unlinked, "t0n0", "t1n0"), dist(linkedOff, "t0n0", "t1n0"), dist(linkedOn, "t0n0", "t1n0")].map(round);
    expect(d[1]).toBeLessThan(d[0]);
    expect(d[2]).toBeLessThanOrEqual(d[1]);
    expect(d).toMatchInlineSnapshot(`
      [
        1098,
        385,
        385,
      ]
    `);
  });

  it("places a new linked note next to its link partner with the setting off (path 5: placement through S)", () => {
    const nodes = vault(2, 6);
    const engine = new LayoutEngine();
    layout(engine, { nodes });
    const r = rng(3);
    // Topic 3 has no other note, so only the link can make t1n0 its most similar placed note.
    const fresh = note("new", 3, r, { links: ["t1n0"] });
    const withNew = [...nodes, fresh];
    layout(engine, { nodes: withNew }, "auto");
    const toPartner = round(dist(withNew, "new", "t1n0"));
    const toOthers = round(Math.min(...nodes.filter((n) => n.id !== "t1n0").map((n) => dist(withNew, "new", n.id))));
    expect([toPartner, toOthers]).toMatchInlineSnapshot(`
      [
        343,
        440,
      ]
    `);
  });
});

describe("C2 similar pair", () => {
  it("keeps notes of one topic closer than notes of different topics", () => {
    const nodes = vault(2, 6);
    layout(new LayoutEngine(), { nodes });
    const same = dist(nodes, "t0n0", "t0n1");
    const other = dist(nodes, "t0n0", "t1n0");
    expect(same).toBeLessThan(other);
    expect([same, other].map(round)).toMatchInlineSnapshot(`
      [
        142,
        1098,
      ]
    `);
  });
});

describe("C3 relation pair", () => {
  it("shortens the distance of a cross-topic pair with the relation weight", () => {
    const d = ["W1", "W3", "W6"].map((type) => {
      const nodes = vault(2, 6);
      layout(new LayoutEngine(), { nodes, edges: [relation("t0n0", "t1n0", type)] });
      return round(dist(nodes, "t0n0", "t1n0"));
    });
    expect(d[1]).toBeLessThanOrEqual(d[0]);
    expect(d[2]).toBeLessThanOrEqual(d[1]);
    expect(d).toMatchInlineSnapshot(`
      [
        359,
        243,
        243,
      ]
    `);
  });

  it("combines relation and similarity by max: a weight-1 relation adds little to an already similar pair", () => {
    const plain = vault(2, 6);
    layout(new LayoutEngine(), { nodes: plain });
    const related = vault(2, 6);
    layout(new LayoutEngine(), { nodes: related, edges: [relation("t0n0", "t0n1", "W1")] });
    expect([dist(plain, "t0n0", "t0n1"), dist(related, "t0n0", "t0n1")].map(round)).toMatchInlineSnapshot(`
      [
        142,
        142,
      ]
    `);
  });
});

describe("C4 conflict pair", () => {
  it("pushes two similar notes apart", () => {
    const nodes = vault(2, 6);
    layout(new LayoutEngine(), { nodes, edges: [relation("t0n0", "t0n1", "CONFLICTS_WITH")] });
    const d = dist(nodes, "t0n0", "t0n1");
    const plain = vault(2, 6);
    layout(new LayoutEngine(), { nodes: plain });
    expect(d).toBeGreaterThan(dist(plain, "t0n0", "t0n1"));
    expect([round(d), round(2.5 * 350)]).toMatchInlineSnapshot(`
      [
        547,
        875,
      ]
    `);
  });
});

/** Mean distance over all pairs from different topics. */
function meanCrossDistance(nodes: ScatterNode[]): number {
  let sum = 0;
  let count = 0;
  for (const a of nodes) {
    for (const b of nodes) {
      if (a.id < b.id && a.id.slice(0, 2) !== b.id.slice(0, 2)) {
        sum += Math.hypot(a.x - b.x, a.y - b.y);
        count++;
      }
    }
  }
  return sum / count;
}

/** Mean distance over all pairs within one topic. */
function meanInnerDistance(nodes: ScatterNode[]): number {
  let sum = 0;
  let count = 0;
  for (const a of nodes) {
    for (const b of nodes) {
      if (a.id < b.id && a.id.slice(0, 2) === b.id.slice(0, 2)) {
        sum += Math.hypot(a.x - b.x, a.y - b.y);
        count++;
      }
    }
  }
  return sum / count;
}

describe("C5 unrelated points and cloud spacing (#283)", () => {
  it("spreads single unrelated notes apart with cloud spacing, although they form no cloud", () => {
    const spread = [300, 3000].map((cloudSpacing) => {
      const nodes = vault(4, 1);
      layout(new LayoutEngine(), { nodes, cloudSpacing });
      return round(meanCrossDistance(nodes));
    });
    expect(spread[1]).toBeGreaterThan(spread[0]);
    expect(spread).toMatchInlineSnapshot(`
      [
        350,
        1021,
      ]
    `);
  });
});

describe("C6 several groups", () => {
  it("records how cloud spacing changes the distance between groups and within a group", () => {
    const measured = [800, 3000].map((cloudSpacing) => {
      const nodes = vault(3, 5);
      layout(new LayoutEngine(), { nodes, cloudSpacing });
      return { cross: round(meanCrossDistance(nodes)), inner: round(meanInnerDistance(nodes)) };
    });
    expect(measured[0].inner).toBeLessThan(measured[0].cross);
    expect(measured).toMatchInlineSnapshot(`
      [
        {
          "cross": 994,
          "inner": 164,
        },
        {
          "cross": 3699,
          "inner": 164,
        },
      ]
    `);
  });
});

describe("C7 stability per trigger", () => {
  /** A settled vault with stored positions and an engine that has seen it. */
  function settled() {
    const nodes = vault(3, 6);
    const edges = [relation("t0n0", "t1n0", "W3"), relation("t1n1", "t2n1", "W1")];
    const engine = new LayoutEngine();
    layout(engine, { nodes, edges });
    return { nodes, edges, engine };
  }

  it("reopen with stored positions: nothing moves", () => {
    const { nodes, edges } = settled();
    const before = positions(nodes);
    const reopened = new LayoutEngine();
    expect(layout(reopened, { nodes, edges }, "auto").kind).toBe("none");
    expect(maxMove(before, nodes)).toBe(0);
  });

  it("edit one note: only the bounded area moves, by a recorded amount", () => {
    const { nodes, edges, engine } = settled();
    const before = positions(nodes);
    byId(nodes, "t2n3").content = "rewritten words";
    expect(layout(engine, { nodes, edges }, "auto").kind).toBe("bounded");
    const moved = nodes.filter((n) => maxMove(before, [n]) > 0).length;
    expect({ moved, of: nodes.length, max: round(maxMove(before, nodes)) }).toMatchInlineSnapshot(`
      {
        "max": 26,
        "moved": 6,
        "of": 18,
      }
    `);
  });

  it("hide two notes and show them again: hiding moves nobody, showing again moves the area around them", () => {
    const { nodes, edges, engine } = settled();
    const before = positions(nodes);
    const hidden = new Set(["t2n4", "t2n5"]);
    const visible = nodes.filter((n) => !hidden.has(n.id));
    layout(engine, { nodes: visible, edges }, "auto");
    expect(maxMove(before, visible)).toBe(0);
    const result = layout(engine, { nodes, edges }, "auto");
    expect({ kind: result.kind, max: round(maxMove(before, nodes)) }).toMatchInlineSnapshot(`
      {
        "kind": "bounded",
        "max": 0,
      }
    `);
  });

  it("delete a relation in the relation builder: rearranges everything from scratch", () => {
    const { nodes, edges, engine } = settled();
    const before = positions(nodes);
    layout(engine, { nodes, edges: edges.slice(1) }, "rearrange");
    const untouched = new Set(nodes.filter((n) => !["t0n0", "t1n0"].includes(n.id)).map((n) => n.id));
    expect(round(maxMove(before, nodes, untouched))).toMatchInlineSnapshot(`210`);
  });

  it("move the node spacing slider: a free pass over all notes", () => {
    const { nodes, edges, engine } = settled();
    const before = positions(nodes);
    const result = layout(engine, { nodes, edges, nodeSpacing: 500 }, "auto");
    expect({ kind: result.kind, max: round(maxMove(before, nodes)) }).toMatchInlineSnapshot(`
      {
        "kind": "free",
        "max": 189,
      }
    `);
  });
});
