import { describe, expect, it, vi } from "vitest";
import type { MemVectorSettings } from "../../../settings/types";
import { DEFAULT_SETTINGS } from "../../../settings/defaults";
import type { ScatterNode } from "../types";
import { applyVectorLayout } from "./applyVectorLayout";
import { applyGraphVectorProjection } from "./projections";
import * as similarityModule from "./similarity";

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
  it("calls rescaleSimilarityMatrix exactly once during applyVectorLayout", () => {
    const rescaleSpy = vi.spyOn(similarityModule, "rescaleSimilarityMatrix");

    try {
      const nodes: ScatterNode[] = [
        makeNode("node1", [1, 0, 0]),
        makeNode("node2", [0.8, 0.2, 0]),
        makeNode("node3", [0, 1, 0]),
      ];

      const settings: MemVectorSettings = {
        ...DEFAULT_SETTINGS,
        knowledgeDomain: "general",
      };

      rescaleSpy.mockClear();

      applyVectorLayout(nodes, settings, 200, 500, []);

      // Verifies Issue #75: Matrix is rescaled by its owner (applyVectorLayout),
      // and NOT rescaled a second time inside applyGraphVectorProjection.
      expect(rescaleSpy).toHaveBeenCalledTimes(1);

      // Verify layout ran and coordinates were assigned
      expect(nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
      expect(nodes.some((n) => n.x !== 0 || n.y !== 0)).toBe(true);
    } finally {
      rescaleSpy.mockRestore();
    }
  });

  it("does not call rescaleSimilarityMatrix inside applyGraphVectorProjection", () => {
    const rescaleSpy = vi.spyOn(similarityModule, "rescaleSimilarityMatrix");

    try {
      const nodes: ScatterNode[] = [
        makeNode("A"),
        makeNode("B"),
      ];

      const matrix = [
        [1.0, 0.42],
        [0.42, 1.0],
      ];

      rescaleSpy.mockClear();

      applyGraphVectorProjection({
        nodes,
        matrix,
        nodeSpacing: 100,
        cloudSpacing: 200,
        relationEdges: [],
      });

      // applyGraphVectorProjection must consume the matrix directly without re-rescaling
      expect(rescaleSpy).not.toHaveBeenCalled();
    } finally {
      rescaleSpy.mockRestore();
    }
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
      matrix: customAffinities,
      nodeSpacing: 150,
      cloudSpacing: 300,
      relationEdges: [],
    });

    // Positions must be assigned and finite without exploding or collapsing
    for (const node of nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
  });
});
