/**
 * Purpose: Characterization of today's layout forces and triggers (Plan 0005 step 2, #284, #283). Records what the
 * layout does now, including behavior Plan 0005 section 7 will change (WikiLinks through the similarity, max instead
 * of sum, hops, cloud spacing as point repulsion). Distances are asserted as relations; measured values are recorded as
 * rounded inline snapshots so step 3 and 4 show exactly what changed. Since step 3 (stabilization) C7 records the
 * stabilized behavior. Since step 4 (signal model) every case is recorded with the signal model; C1 shows that a
 * WikiLink has no effect anywhere with its weight at 0. Earlier values are listed in Plan 0005 section 6.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../../settings/defaults";
import type { MemVectorSettings } from "../../../settings/types";
import type { RelationTermDef } from "../../../relationVocabulary/types";
import type { RelationEdge, ScatterNode } from "../types";
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
  links?: Map<string, string[]>;
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
      links: run.links,
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

describe("C1 linked pair: a WikiLink acts only through its weight", () => {
  const link = new Map([["t0n0.md", ["t1n0.md"]]]);

  it("does nothing with the link weight at 0, and pulls with a weight above 0", () => {
    const d = [undefined, 0, 0.3, 1].map((w) => {
      const nodes = vault(2, 6);
      const settings = w === undefined ? {} : { layoutWeightLinks: w };
      layout(new LayoutEngine(), { nodes, links: w === undefined ? undefined : link, settings });
      return round(dist(nodes, "t0n0", "t1n0"));
    });
    expect(d[1]).toBe(d[0]);
    expect(d[2]).toBeLessThan(d[1]);
    expect(d[3]).toBeLessThanOrEqual(d[2]);
    expect(d).toMatchInlineSnapshot(`
      [
        1098,
        1098,
        435,
        359,
      ]
    `);
  });

  it("places a new linked note next to its partner only while the link weight is above 0", () => {
    const placed = [0, 1].map((w) => {
      const nodes = vault(2, 6);
      const engine = new LayoutEngine();
      layout(engine, { nodes, settings: { layoutWeightLinks: w } });
      const fresh = note("new", 3, rng(3));
      const withNew = [...nodes, fresh];
      layout(engine, { nodes: withNew, links: new Map([["new.md", ["t1n0.md"]]]), settings: { layoutWeightLinks: w } }, "auto");
      return round(dist(withNew, "new", "t1n0"));
    });
    expect(placed[1]).toBeLessThan(placed[0]);
    expect(placed).toMatchInlineSnapshot(`
      [
        632,
        309,
      ]
    `);
  });

  it("leaves the clusters unchanged with the link weight at 0", () => {
    const clusters = (links?: Map<string, string[]>) => {
      const nodes = vault(3, 4);
      layout(new LayoutEngine(), { nodes, links, settings: { layoutWeightLinks: 0 } });
      return nodes.map((n) => n.cloudId);
    };
    expect(clusters(new Map([["t0n0.md", ["t2n0.md"]], ["t1n1.md", ["t2n2.md"]]]))).toEqual(clusters());
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
          "cross": 3700,
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
    {
      // The note moves halfway towards another topic: a real content change for the semantic signal.
      const edited = byId(nodes, "t2n3");
      const other = byId(nodes, "t1n3").embedding!;
      edited.embedding = edited.embedding!.map((v, k) => (v + other[k]) / 2);
    };
    expect(layout(engine, { nodes, edges }, "auto").kind).toBe("bounded");
    const moved = nodes.filter((n) => maxMove(before, [n]) > 0).length;
    const untouched = new Set(nodes.filter((n) => n.id !== "t2n3").map((n) => n.id));
    expect(maxMove(before, nodes, untouched)).toBeLessThanOrEqual(0.15 * 350 + 1e-9);
    expect({ moved, of: nodes.length, edited: round(maxMove(before, nodes)), untouched: round(maxMove(before, nodes, untouched)) }).toMatchInlineSnapshot(`
      {
        "edited": 356,
        "moved": 6,
        "of": 18,
        "untouched": 42,
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

  it("delete a relation in the relation builder: a bounded pass around the endpoints (S1)", () => {
    const { nodes, edges, engine } = settled();
    const before = positions(nodes);
    const result = layout(engine, { nodes, edges: edges.slice(1) }, "relations");
    const untouched = new Set(nodes.filter((n) => !["t0n0", "t1n0"].includes(n.id)).map((n) => n.id));
    expect(round(maxMove(before, nodes, untouched))).toBeLessThanOrEqual(round(0.15 * 350));
    expect({ kind: result.kind, max: round(maxMove(before, nodes, untouched)) }).toMatchInlineSnapshot(`
      {
        "kind": "bounded",
        "max": 53,
      }
    `);
  });

  it("move the node spacing slider: the map scales, nothing is simulated (S4)", () => {
    const { nodes, edges, engine } = settled();
    const before = positions(nodes);
    const result = layout(engine, { nodes, edges, nodeSpacing: 500 }, "auto");
    let worst = 0;
    for (const n of nodes) {
      const p = before.get(n.id)!;
      worst = Math.max(worst, Math.hypot(n.x - (p.x * 500) / 350, n.y - (p.y * 500) / 350));
    }
    expect({ kind: result.kind, simulated: result.simulated, moved: result.moved, offScale: worst < 1e-9 }).toMatchInlineSnapshot(`
      {
        "kind": "none",
        "moved": true,
        "offScale": true,
        "simulated": false,
      }
    `);
  });

  it("move the cloud spacing slider: nothing moves until the next rearrange (S5)", () => {
    const { nodes, edges, engine } = settled();
    const before = positions(nodes);
    const result = layout(engine, { nodes, edges, cloudSpacing: 3000 }, "auto");
    expect({ kind: result.kind, max: maxMove(before, nodes) }).toMatchInlineSnapshot(`
      {
        "kind": "none",
        "max": 0,
      }
    `);
  });
;
});
