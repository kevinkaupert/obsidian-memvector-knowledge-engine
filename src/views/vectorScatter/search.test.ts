import { describe, expect, it } from "vitest";
import { findNodeByQuery } from "./search";
import type { ScatterNode } from "./types";

function node(id: string, title: string): ScatterNode {
  return { id, title, type: "definition", path: `${id}.md`, x: 0, y: 0, latexFormulas: [], links: [], content: "" };
}

describe("findNodeByQuery", () => {
  const nodes = [node("gauss-summenformel", "Gauß-Summenformel"), node("induktion", "Vollständige Induktion")];

  it("finds an exact title match case-insensitively", () => {
    expect(findNodeByQuery(nodes, "gauß-summenformel")?.id).toBe("gauss-summenformel");
  });

  it("finds a substring match when there is no exact match", () => {
    expect(findNodeByQuery(nodes, "gauss")?.id).toBe("gauss-summenformel");
  });

  it("matches against the id as well as the title", () => {
    expect(findNodeByQuery(nodes, "induktion")?.id).toBe("induktion");
  });

  it("returns null for an empty query", () => {
    expect(findNodeByQuery(nodes, "  ")).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(findNodeByQuery(nodes, "kein-treffer")).toBeNull();
  });
});
