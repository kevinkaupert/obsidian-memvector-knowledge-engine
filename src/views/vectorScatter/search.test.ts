import { describe, expect, it } from "vitest";
import { findNodesByQuery } from "./search";
import type { ScatterNode } from "./types";

function node(id: string, title: string): ScatterNode {
  return { id, title, type: "definition", path: `${id}.md`, x: 0, y: 0, latexFormulas: [], links: [], content: "" };
}

describe("findNodesByQuery", () => {
  const nodes = [node("aussage", "Aussage"), node("aussagen-von-mengen", "Aussagen von Mengen"), node("induktion", "Vollständige Induktion")];

  it("puts an exact title match first", () => {
    expect(findNodesByQuery(nodes, "aussage").map((n) => n.id)).toEqual(["aussage", "aussagen-von-mengen"]);
  });

  it("returns every substring match, not just the first", () => {
    expect(findNodesByQuery(nodes, "auss").map((n) => n.id)).toEqual(["aussage", "aussagen-von-mengen"]);
  });

  it("matches against the id as well as the title", () => {
    expect(findNodesByQuery(nodes, "induktion").map((n) => n.id)).toEqual(["induktion"]);
  });

  it("returns an empty array for an empty query", () => {
    expect(findNodesByQuery(nodes, "  ")).toEqual([]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(findNodesByQuery(nodes, "kein-treffer")).toEqual([]);
  });
});
