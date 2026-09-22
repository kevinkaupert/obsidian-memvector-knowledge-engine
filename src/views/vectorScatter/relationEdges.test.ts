import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { pathToId } from "../../noteSlug";
import { loadRelationEdges } from "./relationEdges";

interface FakeFile {
  path: string;
  basename: string;
  frontmatter?: Record<string, unknown>;
}

/**
 * Minimal fake of the vault/metadataCache surface loadRelationEdges needs.
 * getFirstLinkpathDest mirrors Obsidian's own link-resolution API so the
 * relation file's `source_note`/`target_note` WikiLink resolves to the exact
 * target file, not a basename guess.
 */
function fakeApp(files: FakeFile[]): App {
  const tfiles = files.map((f) => ({ path: f.path, basename: f.basename, name: `${f.basename}.md` }));

  return {
    vault: {
      getMarkdownFiles: () => tfiles,
      read: async () => "",
    },
    metadataCache: {
      getFileCache: (file: { path: string }) => {
        const src = files.find((f) => f.path === file.path);
        return src?.frontmatter ? { frontmatter: src.frontmatter } : undefined;
      },
      getFirstLinkpathDest: (linktext: string) => {
        const normalized = linktext.replace(/\.md$/i, "");
        const byPath = tfiles.find((f) => f.path.replace(/\.md$/i, "") === normalized);
        if (byPath) return byPath;
        return tfiles.find((f) => f.basename === normalized) || null;
      },
    },
  } as unknown as App;
}

describe("loadRelationEdges", () => {
  it("resolves source_note/target_note WikiLinks to the same canonical id scheme as the rest of the graph (F04a)", async () => {
    const app = fakeApp([
      { path: "Alpha.md", basename: "Alpha" },
      { path: "Beta.md", basename: "Beta" },
      {
        path: "wiki/relations/rel-alpha-to-beta.md",
        basename: "rel-alpha-to-beta",
        frontmatter: { source_note: "[[Alpha|Alpha]]", target_note: "[[Beta|Beta]]", relation_type: "REQUIRES" },
      },
    ]);

    const edges = await loadRelationEdges(app);

    expect(edges).toHaveLength(1);
    expect(edges[0].srcId).toBe(pathToId("Alpha.md"));
    expect(edges[0].tgtId).toBe(pathToId("Beta.md"));
  });

  it("distinguishes same-basename targets in different folders instead of colliding (F04b)", async () => {
    const app = fakeApp([
      { path: "Work/Overview.md", basename: "Overview" },
      { path: "Home/Overview.md", basename: "Overview" },
      { path: "Alpha.md", basename: "Alpha" },
      {
        path: "wiki/relations/rel-alpha-to-overview.md",
        basename: "rel-alpha-to-overview",
        frontmatter: { source_note: "[[Alpha|Alpha]]", target_note: "[[Home/Overview|Overview]]", relation_type: "REQUIRES" },
      },
    ]);

    const edges = await loadRelationEdges(app);

    expect(edges[0].tgtId).toBe(pathToId("Home/Overview.md"));
    expect(edges[0].tgtId).not.toBe(pathToId("Work/Overview.md"));
  });

  it("loads two different relation types in the same direction between the same pair as two edges, not one (#29 root cause)", async () => {
    const app = fakeApp([
      { path: "Alpha.md", basename: "Alpha" },
      { path: "Beta.md", basename: "Beta" },
      {
        path: "wiki/relations/rel-beta-to-alpha-reduces-to.md",
        basename: "rel-beta-to-alpha-reduces-to",
        frontmatter: { source_note: "[[Beta|Beta]]", target_note: "[[Alpha|Alpha]]", relation_type: "REDUCES_TO" },
      },
      {
        path: "wiki/relations/rel-beta-to-alpha-relimplies.md",
        basename: "rel-beta-to-alpha-relimplies",
        frontmatter: { source_note: "[[Beta|Beta]]", target_note: "[[Alpha|Alpha]]", relation_type: "RELIMPLIES" },
      },
    ]);

    const edges = await loadRelationEdges(app);

    expect(edges).toHaveLength(2);
    const types = edges.map((e) => e.relType).sort();
    expect(types).toEqual(["RELIMPLIES", "REDUCES_TO"].sort());
  });
});


describe("relation exclusions (#82)", () => {
  it.each(["-path:wiki/relations", "-file:Alpha", "-file:Beta"])(
    "omits relations excluded by their own path or either endpoint: %s",
    async (exclusions) => {
      const app = fakeApp([
        { path: "Alpha.md", basename: "Alpha" },
        { path: "Beta.md", basename: "Beta" },
        {
          path: "wiki/relations/rel.md", basename: "rel",
          frontmatter: { source_note: "[[Alpha]]", target_note: "[[Beta]]", relation_type: "REQUIRES" },
        },
      ]);
      expect(await loadRelationEdges(app)).toHaveLength(1);
      const read = vi.spyOn(app.vault, "read");
      expect(await loadRelationEdges(app, exclusions)).toEqual([]);
      if (exclusions === "-path:wiki/relations") expect(read).not.toHaveBeenCalled();
      expect(await loadRelationEdges(app, "-path:unrelated")).toHaveLength(1);
    }
  );
});
