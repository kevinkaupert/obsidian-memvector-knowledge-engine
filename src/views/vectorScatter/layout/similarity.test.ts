import { describe, expect, it, vi } from "vitest";
import { buildSimilarityMatrix, calcSimilarity, normalizeWeights, prepareNodeTokens, rescaleSimilarityMatrix } from "./similarity";
import * as similarityModule from "./similarity";
import type { ScatterNode } from "../types";

function makeNode(overrides: Partial<ScatterNode>): ScatterNode {
  return {
    id: "n",
    basenameKey: (overrides.id as string) ?? "n",
    title: "N",
    type: "concept",
    path: "n.md",
    x: 0,
    y: 0,
    latexFormulas: [],
    links: [],
    content: "",
    ...overrides,
  };
}

describe("normalizeWeights", () => {
  it("normalizes to sum to 1", () => {
    const w = normalizeWeights({ vector: 50, wikiLinks: 30, folder: 10, semantics: 10 });
    expect(w.vector + w.wikiLinks + w.folder + w.semantics).toBeCloseTo(1);
    expect(w.vector).toBeCloseTo(0.5);
  });

  it("falls back to safe defaults when all weights are 0", () => {
    const w = normalizeWeights({ vector: 0, wikiLinks: 0, folder: 0, semantics: 0 });
    expect(w).toEqual({ vector: 0, wikiLinks: 0, folder: 0, semantics: 0 });
  });
});

const weights = normalizeWeights({ vector: 50, wikiLinks: 30, folder: 10, semantics: 10 });

describe("calcSimilarity", () => {
  it("weights a perfect vector match by its share of the blend (0.5 here, not 1.0 - other signals are absent, not maxed)", () => {
    const a = makeNode({ id: "a", embedding: [1, 0, 0] });
    const b = makeNode({ id: "b", embedding: [1, 0, 0] });
    expect(calcSimilarity(a, b, weights, false)).toBeCloseTo(weights.vector, 5);
  });

  it("gives a similarity boost for a mutual wikilink even without embeddings", () => {
    const a = makeNode({ id: "a", links: ["b"] });
    const b = makeNode({ id: "b" });
    const unlinked = makeNode({ id: "c" });
    expect(calcSimilarity(a, b, weights, false)).toBeGreaterThan(calcSimilarity(a, unlinked, weights, false));
  });

  it("gives a similarity boost for notes in the same folder", () => {
    const a = makeNode({ id: "a", path: "wiki/definitions/a.md" });
    const sameFolder = makeNode({ id: "b", path: "wiki/definitions/b.md" });
    const otherFolder = makeNode({ id: "c", path: "wiki/theorems/c.md" });
    expect(calcSimilarity(a, sameFolder, weights, false)).toBeGreaterThan(calcSimilarity(a, otherFolder, weights, false));
  });
});

describe("buildSimilarityMatrix", () => {
  it("is symmetric with a 1.0 diagonal", () => {
    const nodes = [makeNode({ id: "a" }), makeNode({ id: "b" }), makeNode({ id: "c" })];
    const matrix = buildSimilarityMatrix(nodes, weights, false);
    expect(matrix[0][0]).toBe(1.0);
    expect(matrix[1][2]).toBe(matrix[2][1]);
  });

  it("precomputes tokens in O(N) instead of O(N^2) pairwise re-tokenizations (#80)", () => {
    const matchSpy = vi.spyOn(String.prototype, "match");
    try {
      const N = 10;
      const nodes = Array.from({ length: N }, (_, i) =>
        makeNode({
          id: `note_${i}`,
          content: `Content for note ${i} with multiple tokens and keywords for testing.`,
          latexFormulas: [`x_${i} = \\alpha + \\beta`],
          path: `folder/sub/note_${i}.md`,
        })
      );

      matchSpy.mockClear();
      const matrix = buildSimilarityMatrix(nodes, weights, false);

      // Verifies Issue #80: Tokenization regex match is called exactly N times (once per node in O(N)),
      // NOT N*(N-1) (90 times) or N*(N-1)/2 (45 times).
      expect(matchSpy).toHaveBeenCalledTimes(N);

      // Verify matrix correctness
      expect(matrix.length).toBe(N);
      expect(matrix[0][0]).toBe(1.0);
      expect(matrix[2][5]).toBe(matrix[5][2]);
    } finally {
      matchSpy.mockRestore();
    }
  });

  it("extracts words, formulas, and folder correctly in prepareNodeTokens", () => {
    const node = makeNode({
      id: "test",
      content: "Alpha beta gamma 123",
      latexFormulas: ["E = mc^2"],
      path: "science/physics/relativity.md",
    });

    const tokens = prepareNodeTokens(node);
    expect(tokens.words.has("alpha")).toBe(true);
    expect(tokens.words.has("beta")).toBe(true);
    expect(tokens.words.has("gamma")).toBe(true);
    expect(tokens.words.has("123")).toBe(true);
    expect(tokens.formulas.has("E = mc^2")).toBe(true);
    expect(tokens.folder).toBe("science/physics");
  });

  it("produces identical similarity values whether using precomputed tokens or raw fallback", () => {
    const a = makeNode({
      id: "a",
      content: "Complex quantum mechanics and wave function equations.",
      latexFormulas: ["\\psi(x) = e^{ikx}"],
      path: "physics/quantum.md",
      embedding: [0.6, 0.8],
    });
    const b = makeNode({
      id: "b",
      content: "Wave mechanics and quantum state vectors in physics.",
      latexFormulas: ["\\psi(x) = e^{ikx}"],
      path: "physics/states.md",
      embedding: [0.5, 0.85],
    });

    const rawSim = calcSimilarity(a, b, weights, true);
    const tokensA = prepareNodeTokens(a);
    const tokensB = prepareNodeTokens(b);
    const precomputedSim = calcSimilarity(a, b, weights, true, tokensA, tokensB);

    expect(precomputedSim).toBeCloseTo(rawSim, 6);
  });
});

describe("rescaleSimilarityMatrix", () => {
  it("stretches a narrow anisotropic range [0.65, 0.95] to [0, 1] while preserving diagonal", () => {
    const raw = [
      [1.0, 0.95, 0.65],
      [0.95, 1.0, 0.80],
      [0.65, 0.80, 1.0],
    ];
    const rescaled = rescaleSimilarityMatrix(raw);
    expect(rescaled[0][0]).toBe(1.0);
    expect(rescaled[1][1]).toBe(1.0);
    expect(rescaled[2][2]).toBe(1.0);

    // 0.65 was min off-diagonal -> maps to 0.0
    expect(rescaled[0][2]).toBeCloseTo(0.0);
    expect(rescaled[2][0]).toBeCloseTo(0.0);

    // 0.95 was max off-diagonal -> maps to 1.0
    expect(rescaled[0][1]).toBeCloseTo(1.0);
    expect(rescaled[1][0]).toBeCloseTo(1.0);

    // 0.80 was mid-point ((0.80 - 0.65) / (0.95 - 0.65) = 0.15 / 0.30 = 0.5)
    expect(rescaled[1][2]).toBeCloseTo(0.5);
    expect(rescaled[2][1]).toBeCloseTo(0.5);
  });

  it("is idempotent when applied repeatedly", () => {
    const raw = [
      [1.0, 0.9, 0.7],
      [0.9, 1.0, 0.8],
      [0.7, 0.8, 1.0],
    ];
    const once = rescaleSimilarityMatrix(raw);
    const twice = rescaleSimilarityMatrix(once);
    expect(twice[0][1]).toBeCloseTo(once[0][1]);
    expect(twice[0][2]).toBeCloseTo(once[0][2]);
    expect(twice[1][2]).toBeCloseTo(once[1][2]);
  });

  it("leaves matrix unchanged when spread is zero or matrix is small", () => {
    const identical = [
      [1.0, 0.5],
      [0.5, 1.0],
    ];
    expect(rescaleSimilarityMatrix(identical)).toEqual(identical);

    const single = [[1.0]];
    expect(rescaleSimilarityMatrix(single)).toEqual(single);

    const empty: number[][] = [];
    expect(rescaleSimilarityMatrix(empty)).toEqual(empty);
  });
});

