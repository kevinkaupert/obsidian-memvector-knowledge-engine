import { describe, expect, it } from "vitest";
import { assignClouds } from "./cloudAssignment";
import type { ScatterNode } from "../types";

function makeNode(id: string, title: string, hasEmbedding: boolean): ScatterNode {
  return {
    id,
    title,
    path: `${id}.md`,
    basenameKey: id,
    content: title,
    type: "concept",
    x: 0,
    y: 0,
    latexFormulas: [],
    links: [],
    embedding: hasEmbedding ? [1, 0, 0] : undefined,
  };
}

describe("assignClouds (#224 hardening)", () => {
  it("selects the embedded note as centroid when n <= numClouds (e.g. n = 2)", () => {
    const unEmbedded = makeNode("unembedded", "Unembedded Note", false);
    const embedded = makeNode("embedded", "Embedded Note", true);
    const nodes = [unEmbedded, embedded];
    const matrix = [
      [1.0, 0.2],
      [0.2, 1.0],
    ];

    const centroids = assignClouds(nodes, matrix);
    expect(centroids).toEqual(["embedded"]);
    expect(nodes[0].cloudLabel).toBe("Embedded Note");
    expect(nodes[1].cloudLabel).toBe("Embedded Note");
    expect(nodes[0].cloudId).toBe(0);
    expect(nodes[1].cloudId).toBe(0);
  });

  it("defaults to nodes[0] if neither has an embedding when n <= numClouds", () => {
    const n1 = makeNode("n1", "Note 1", false);
    const n2 = makeNode("n2", "Note 2", false);
    const nodes = [n1, n2];
    const matrix = [
      [1.0, 0.0],
      [0.0, 1.0],
    ];

    const centroids = assignClouds(nodes, matrix);
    expect(centroids).toEqual(["n1"]);
    expect(nodes[0].cloudLabel).toBe("Note 1");
  });
});
