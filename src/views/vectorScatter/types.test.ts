import { describe, expect, it } from "vitest";
import { filterVisibleNodes, isRelationNode, type ScatterNode } from "./types";

function createMockNode(overrides: Partial<ScatterNode>): ScatterNode {
  return {
    id: "wiki/concepts/sample",
    basenameKey: "sample",
    title: "Sample",
    type: "concept",
    path: "wiki/concepts/sample.md",
    x: 100,
    y: 200,
    latexFormulas: [],
    links: [],
    content: "Content",
    ...overrides,
  };
}

describe("isRelationNode (#59)", () => {
  it("detects relation notes by node type", () => {
    const node = createMockNode({
      id: "wiki/notes/rel-1",
      path: "wiki/notes/rel-1.md",
      type: "relation",
    });
    expect(isRelationNode(node)).toBe(true);
  });

  it("detects relation notes by wiki/relations/ path", () => {
    const node = createMockNode({
      id: "wiki/relations/rel-concept-a-b",
      path: "wiki/relations/rel-concept-a-b.md",
      type: "concept",
    });
    expect(isRelationNode(node)).toBe(true);
  });

  it("detects relation notes by /relations/ path segment", () => {
    const node = createMockNode({
      id: "custom/relations/is-a",
      path: "custom/relations/is-a.md",
      type: "concept",
    });
    expect(isRelationNode(node)).toBe(true);
  });

  it("returns false for standard concept, definition, and theorem notes", () => {
    const conceptNode = createMockNode({
      id: "wiki/concepts/group",
      path: "wiki/concepts/group.md",
      type: "concept",
    });
    const theoremNode = createMockNode({
      id: "wiki/theorems/fermat",
      path: "wiki/theorems/fermat.md",
      type: "theorem",
    });
    const definitionNode = createMockNode({
      id: "wiki/definitions/vector-space",
      path: "wiki/definitions/vector-space.md",
      type: "definition",
    });

    expect(isRelationNode(conceptNode)).toBe(false);
    expect(isRelationNode(theoremNode)).toBe(false);
    expect(isRelationNode(definitionNode)).toBe(false);
  });
});

describe("filterVisibleNodes (#59)", () => {
  const concept1 = createMockNode({ id: "concept-1", path: "wiki/concepts/c1.md", type: "concept", x: 10, y: 20 });
  const concept2 = createMockNode({ id: "concept-2", path: "wiki/concepts/c2.md", type: "concept", x: 30, y: 40 });
  const relationNode = createMockNode({
    id: "wiki/relations/c1-c2",
    path: "wiki/relations/c1-c2.md",
    type: "relation",
    x: 50,
    y: 60,
  });

  it("returns all nodes unmodified when showRelationNotes is true", () => {
    const nodes = [concept1, relationNode, concept2];
    const visible = filterVisibleNodes(nodes, true);
    expect(visible).toHaveLength(3);
    expect(visible).toEqual(nodes);
  });

  it("omits relation notes when showRelationNotes is false", () => {
    const nodes = [concept1, relationNode, concept2];
    const visible = filterVisibleNodes(nodes, false);
    expect(visible).toHaveLength(2);
    expect(visible.map((n) => n.id)).toEqual(["concept-1", "concept-2"]);
    // Preserves coordinates
    expect(visible[0].x).toBe(10);
    expect(visible[1].y).toBe(40);
  });

  it("handles empty lists gracefully", () => {
    expect(filterVisibleNodes([], true)).toEqual([]);
    expect(filterVisibleNodes([], false)).toEqual([]);
  });

  it("returns empty array when all nodes are relation notes and toggle is false", () => {
    const allRelations = [
      relationNode,
      createMockNode({ id: "rel-2", path: "wiki/relations/rel-2.md", type: "relation" }),
    ];
    expect(filterVisibleNodes(allRelations, false)).toHaveLength(0);
  });
});
