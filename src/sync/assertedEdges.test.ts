import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { deleteEdgeUnlessAsserted, edgeKey, loadAssertedEdgeKeys } from "./assertedEdges";
import type { GraphStore } from "./graphStore";
import { pathToId } from "../noteSlug";

vi.mock("obsidian", () => ({ TFile: class {}, Notice: class {} }));

const app = { vault: { getAbstractFileByPath: () => null } } as unknown as App;
const edge = (src: string, tgt: string, path: string, extra: Record<string, unknown> = {}) => ({
  srcId: src, tgtId: tgt, relType: "REQUIRES", desc: "", title: "", path, bidirectional: false, ...extra,
});

describe("asserted graph edges (#254)", () => {
  interface FakeNote { path: string; frontmatter?: Record<string, unknown> }
  function fakeVault(notes: FakeNote[]): App {
    const files = notes.map((n) => ({ path: n.path, basename: n.path.split("/").pop()!.replace(/\.md$/, "") }));
    return {
      vault: { getMarkdownFiles: () => files, getAbstractFileByPath: () => null, read: async () => "" },
      metadataCache: {
        getFileCache: (f: { path: string }) => {
          const fm = notes.find((n) => n.path === f.path)?.frontmatter;
          return fm ? { frontmatter: fm } : undefined;
        },
        getFirstLinkpathDest: (link: string) => files.find((f) => f.basename === link) ?? null,
      },
    } as unknown as App;
  }
  const id = (name: string) => pathToId(`${name}.md`);
  const relation = (path: string, src: string, tgt: string, extra: Record<string, unknown> = {}) => ({
    path, frontmatter: { type: "relation", source_note: `[[${src}]]`, target_note: `[[${tgt}]]`, relation_type: "REQUIRES", description: "d", ...extra },
  });

  it("keeps a frontmatter assertion hidden behind the ignored relation note (Codex review of #254)", async () => {
    const vault = fakeVault([
      { path: "A.md", frontmatter: { requires: "[[B]]" } },
      { path: "B.md" },
      relation("rel/r.md", "A", "B"),
    ]);
    const keys = await loadAssertedEdgeKeys(vault, {}, ["rel/r.md"]);
    expect(keys).toEqual(new Set([edgeKey(id("A"), id("B"), "REQUIRES")]));
  });

  it("collects both directions of bidirectional notes and skips suggestions and ignored notes", async () => {
    const vault = fakeVault([
      { path: "A.md", frontmatter: { requires_suggested: "[[C]]" } },
      { path: "C.md" }, { path: "X.md" }, { path: "Y.md" }, { path: "P.md" }, { path: "Q.md" },
      relation("rel/xy.md", "X", "Y", { bidirectional: true }),
      relation("rel/deleted.md", "P", "Q"),
    ]);
    const keys = await loadAssertedEdgeKeys(vault, {}, ["rel/deleted.md"]);
    expect(keys).toEqual(new Set([edgeKey(id("X"), id("Y"), "REQUIRES"), edgeKey(id("Y"), id("X"), "REQUIRES")]));
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
