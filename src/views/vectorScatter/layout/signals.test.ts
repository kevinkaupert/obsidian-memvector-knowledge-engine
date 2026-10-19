/**
 * Purpose: The layout signal model (Plan 0005 section 7, ADR-0008): one source per signal, one place that mixes them,
 * and a weight of 0 that removes a signal everywhere.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../../settings/defaults";
import type { RelationEdge, ScatterNode } from "../types";
import {
  DEFAULT_LAYOUT_WEIGHTS,
  buildLayoutSignals,
  combineAffinity,
  layoutWeightsFrom,
  linkSignal,
  relationWeightFactor,
  semanticSignal,
} from "./signals";

function node(id: string, embedding?: number[]): ScatterNode {
  return { id, basenameKey: id, title: id, type: "concept", path: `${id}.md`, x: 0, y: 0, latexFormulas: [], links: [], content: id, embedding };
}

const edge = (srcId: string, tgtId: string, relType: string): RelationEdge => ({ srcId, tgtId, relType, desc: "", title: "", path: "", bidirectional: false });

describe("signal sources", () => {
  it("semantic: 0 without a vector on both sides, squared rescaled cosine otherwise, clamped to [0,1]", () => {
    const nodes = [node("a", [1, 0]), node("b", [0.9, 0.1]), node("c", [0, 1]), node("d")];
    const { matrix } = semanticSignal(nodes);
    expect(matrix[0][3]).toBe(0);
    expect(matrix[0][1]).toBeGreaterThan(matrix[0][2]);
    for (const row of matrix) for (const v of row) expect(v >= 0 && v <= 1).toBe(true);
  });

  it("semantic: falls back to (cos + 1) / 2 when the bounds cannot stretch, so opposite vectors are 0, not 1", () => {
    const { matrix } = semanticSignal([node("a", [1, 0]), node("b", [-1, 0])]);
    expect(matrix[0][1]).toBe(0);
  });

  it("link: comes only from the resolved links, by path, in both directions; the regex links on the node are ignored", () => {
    const a = { ...node("a"), links: ["c"] };
    const nodes = [a, node("b"), node("c")];
    const link = linkSignal(nodes, new Map([["a.md", ["b.md", "missing.md"]]]));
    expect([link[0][1], link[1][0], link[0][2]]).toEqual([1, 1, 0]);
    expect(linkSignal(nodes, undefined)[0][1]).toBe(0);
  });
});

describe("combineAffinity: the only place signals are mixed", () => {
  it("adds the weighted signals and caps the sum at 1", () => {
    const w = { semantic: 1, links: 0.3, relations: 1 };
    expect(combineAffinity(0.2, 1, 0, w)).toBeCloseTo(0.5, 10);
    expect(combineAffinity(0.5, 1, 1, w)).toBe(1);
  });

  it("relation and similarity add up instead of the larger one winning (no max)", () => {
    const w = { semantic: 1, links: 0, relations: 0.5 };
    expect(combineAffinity(0.3, 0, 1, w)).toBeCloseTo(0.8, 10);
  });

  it.each([
    ["semantic", { semantic: 0, links: 1, relations: 1 }, [0.9, 0, 0]],
    ["links", { semantic: 1, links: 0, relations: 1 }, [0, 1, 0]],
    ["relations", { semantic: 1, links: 1, relations: 0 }, [0, 0, 3]],
  ] as const)("a weight of 0 removes the %s signal", (_name, w, [sem, link, rel]) => {
    expect(combineAffinity(sem, link, rel, w)).toBe(0);
  });

  it("keeps the relation weight factor above 1 for strong relations, and 1 when relations are off", () => {
    expect(relationWeightFactor(3, { semantic: 1, links: 1, relations: 1 })).toBe(3);
    expect(relationWeightFactor(3, { semantic: 1, links: 1, relations: 0 })).toBe(1);
    expect(relationWeightFactor(20, { semantic: 1, links: 1, relations: 1 })).toBe(6);
  });
});

describe("buildLayoutSignals", () => {
  it("keeps a repelling relation as repulsion whatever the relation weight", () => {
    const nodes = [node("a"), node("b")];
    const signals = buildLayoutSignals(nodes, [edge("a", "b", "CONFLICTS_WITH")], undefined, undefined, { semantic: 1, links: 1, relations: 0 });
    expect(signals.repel.has("0-1")).toBe(true);
    expect(signals.affinity[0][1]).toBe(0);
  });
});

describe("semantic weight 0 computes no cosine", () => {
  it("leaves the semantic contribution and the bounds empty", () => {
    const nodes = [node("a", [1, 0]), node("b", [0.9, 0.1]), node("c", [0, 1])];
    const signals = buildLayoutSignals(nodes, [], undefined, undefined, { semantic: 0, links: 1, relations: 1 });
    expect(signals.affinity[0][1]).toBe(0);
    expect(signals.bounds).toBeNull();
  });
});

describe("layoutWeightsFrom (settings)", () => {
  it("takes the defaults for missing values and keeps an explicit 0", () => {
    expect(layoutWeightsFrom({})).toEqual(DEFAULT_LAYOUT_WEIGHTS);
    expect(layoutWeightsFrom({ layoutWeightLinks: 0 }).links).toBe(0);
    expect(layoutWeightsFrom({ layoutWeightLinks: -1 }).links).toBe(DEFAULT_LAYOUT_WEIGHTS.links);
  });

  it("ships the defaults in DEFAULT_SETTINGS", () => {
    expect(layoutWeightsFrom(DEFAULT_SETTINGS)).toEqual(DEFAULT_LAYOUT_WEIGHTS);
  });
});
