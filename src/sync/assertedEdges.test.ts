import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { deleteEdgeUnlessAsserted, edgeKey, loadAssertedEdgeKeys } from "./assertedEdges";
import type { GraphStore } from "./graphStore";
import * as relationEdgesModule from "../views/vectorScatter/relationEdges";
import { pathToId } from "../noteSlug";

vi.mock("obsidian", () => ({ TFile: class {}, Notice: class {} }));

const app = { vault: { getAbstractFileByPath: () => null } } as unknown as App;
const edge = (src: string, tgt: string, path: string, extra: Record<string, unknown> = {}) => ({
  srcId: src, tgtId: tgt, relType: "REQUIRES", desc: "", title: "", path, bidirectional: false, ...extra,
});

describe("asserted graph edges (#254)", () => {
  it("collects confirmed edges, both directions of bidirectional ones, and skips ignored paths and suggestions", async () => {
    const spy = vi.spyOn(relationEdgesModule, "loadRelationEdges").mockResolvedValueOnce([
      edge("A", "B", "A.md", { origin: "frontmatter", confidence: "confirmed" }),
      edge("a", "c", "A.md", { origin: "frontmatter", confidence: "suggested" }),
      edge("x", "y", "rel/xy.md", { bidirectional: true }),
      edge("p", "q", "rel/deleted.md"),
    ]);
    try {
      const keys = await loadAssertedEdgeKeys(app, {}, ["rel/deleted.md"]);
      expect(keys).toEqual(new Set([
        edgeKey("a", "b", "REQUIRES"), edgeKey("x", "y", "REQUIRES"), edgeKey("y", "x", "REQUIRES"),
      ]));
      expect(spy.mock.calls[0][3]).toContain("REQUIRES");
    } finally {
      spy.mockRestore();
    }
  });

  it("deletes only unasserted edges and keeps everything when the vault could not be read", async () => {
    const store = { deleteEdge: vi.fn(async () => {}) } as unknown as GraphStore;
    const asserted = new Set([edgeKey(pathToId("A.md"), "b", "REQUIRES")]);
    await deleteEdgeUnlessAsserted(store, asserted, pathToId("A.md"), "b", "requires");
    await deleteEdgeUnlessAsserted(store, null, "a", "c", "REQUIRES");
    expect(store.deleteEdge).not.toHaveBeenCalled();
    await deleteEdgeUnlessAsserted(store, asserted, "a", "c", "REQUIRES");
    expect(store.deleteEdge).toHaveBeenCalledWith("a", "c", "REQUIRES");
  });
});
