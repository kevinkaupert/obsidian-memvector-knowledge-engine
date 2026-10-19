import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../../settings/defaults";
import type { ScatterNode } from "../types";
import { applyVectorLayout } from "./applyVectorLayout";
import { applyGraphVectorProjection } from "./projections";
import { buildLayoutSignals, layoutWeightsFrom } from "./signals";

function makeNode(id: string, embedding?: number[]): ScatterNode {
  return {
    id,
    basenameKey: id,
    title: id,
    path: `${id}.md`,
    x: 0,
    y: 0,
    type: "concept",
    latexFormulas: [],
    links: [],
    content: `Content for ${id}`,
    embedding: embedding ?? [1, 0, 0],
  };
}

describe("applyVectorLayout and single-rescale guarantee (#75)", () => {
  it("produces identical positions and clusters for permuted input (#195)", () => {
    const ordered = [makeNode("a", [1, 0, 0]), makeNode("b", [0, 1, 0]), makeNode("c", [1, 1, 0]), makeNode("d", [0, 0, 1])];
    const shuffled = [ordered[2], ordered[0], ordered[3], ordered[1]].map((node) => ({ ...node }));
    const originalOrder = [...shuffled];
    Object.freeze(shuffled);
    const first = applyVectorLayout(ordered, DEFAULT_SETTINGS, 200, 500, { relationEdges: [] });
    const second = applyVectorLayout(shuffled, DEFAULT_SETTINGS, 200, 500, { relationEdges: [] });
    expect(second).toEqual(first);
    expect(shuffled.map((node) => node.path)).toEqual(["c.md", "a.md", "d.md", "b.md"]);
    shuffled.forEach((node, i) => expect(node).toBe(originalOrder[i]));
    expect([...shuffled].sort((a, b) => a.path.localeCompare(b.path, "en"))).toEqual(ordered);
    expect(second.nodePaths).toEqual(["a.md", "b.md", "c.md", "d.md"]);
    const expected = buildLayoutSignals(ordered, [], undefined, undefined, layoutWeightsFrom(DEFAULT_SETTINGS)).affinity;
    expect(second.affinity).toEqual(expected);
  });
  it("preserves exact caller-provided affinity without distortion", () => {
    // Adversarial test: caller passes a matrix with non-stretched affinities
    // If double-rescaling occurred, 0.35 and 0.45 would be stretched to 0.0 and 1.0.
    const nodes = [makeNode("A"), makeNode("B"), makeNode("C")];
    const customAffinities = [
      [1.0, 0.35, 0.40],
      [0.35, 1.0, 0.45],
      [0.40, 0.45, 1.0],
    ];

    applyGraphVectorProjection({
      nodes,
      signals: { affinity: customAffinities, weightFactor: nodes.map(() => new Float64Array(3).fill(1)), repel: new Set() },
      nodeSpacing: 150,
      cloudSpacing: 300,
    });

    // Positions must be assigned and finite without exploding or collapsing
    for (const node of nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
  });

  it("prevents notes without vectors from collapsing rescale bounds or stacking nodes at the origin (#224)", () => {
    // Vault with 60 embedded notes
    const dim = 16;
    const baseVec = Array.from({ length: dim }, () => 1 / Math.sqrt(dim));
    const embeddedNodes: ScatterNode[] = Array.from({ length: 60 }, (_, i) => {
      const v = baseVec.map((x, d) => x + 0.3 * Math.sin(i * 1.7 + d));
      const norm = Math.hypot(...v);
      const embedding = v.map((x) => x / norm);
      return makeNode(`node_${i}`, embedding);
    });

    const withoutVectorless = embeddedNodes.map((n) => ({ ...n }));
    const modelWithout = applyVectorLayout(withoutVectorless, DEFAULT_SETTINGS, 350, 800, { relationEdges: [] });

    // Add 1 vector-less note (e.g. freshly created or deleted relation note)
    const vectorless = makeNode("unembedded_note", undefined);
    vectorless.embedding = undefined;
    vectorless.content = "";
    const withVectorless = [...embeddedNodes.map((n) => ({ ...n })), vectorless];
    const modelWith = applyVectorLayout(withVectorless, DEFAULT_SETTINGS, 350, 800, { relationEdges: [] });

    // Rescale bounds for embedded notes must remain identical despite the vector-less note
    expect(modelWith.bounds?.low).toBeCloseTo(modelWithout.bounds?.low ?? 0, 5);
    expect(modelWith.bounds?.high).toBeCloseTo(modelWithout.bounds?.high ?? 0, 5);

    // No embedded nodes should be collapsed/stacked near the origin
    const nearZeroWithout = withoutVectorless.filter((n) => Math.hypot(n.x, n.y) < 50).length;
    const nearZeroWith = withVectorless.filter((n) => n.embedding && Math.hypot(n.x, n.y) < 50).length;
    expect(nearZeroWith).toBe(nearZeroWithout);

    // Centroids must all be chosen from embedded notes
    expect(modelWith.centroidIds).not.toContain("unembedded_note");
  });
});
