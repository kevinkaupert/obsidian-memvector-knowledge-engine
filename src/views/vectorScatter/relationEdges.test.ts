import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { pathToId } from "../../noteSlug";
import { loadRelationEdges, loadRelationFilesResult, parseRelationMetadata } from "./relationEdges";

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
  it("resolves duplicate relation files identically for reversed vault order (#195)", async () => {
    const files: FakeFile[] = [
      { path: "Alpha.md", basename: "Alpha" },
      { path: "Beta.md", basename: "Beta" },
      ...["z", "a"].map((id) => ({ path: `wiki/relations/${id}.md`, basename: id,
        frontmatter: { source_note: "[[Alpha]]", target_note: "[[Beta]]", relation_type: "REQUIRES", description: id } })),
    ];
    const first = await loadRelationEdges(fakeApp(files));
    expect(first).toHaveLength(1);
    expect(first[0].path).toBe("wiki/relations/a.md");
    expect(await loadRelationEdges(fakeApp([...files].reverse()))).toEqual(first);
  });
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

describe("parseRelationMetadata (#79)", () => {
  it("extracts relation fields directly from cached frontmatter", () => {
    const meta = parseRelationMetadata({
      source_note: "[[Alpha]]",
      target_note: "[[Beta]]",
      relation_type: "reduces_to",
      bidirectional: true,
      description: "Direct relation",
    });
    expect(meta.rawSrc).toBe("[[Alpha]]");
    expect(meta.rawTgt).toBe("[[Beta]]");
    expect(meta.relType).toBe("REDUCES_TO");
    expect(meta.bidirectional).toBe(true);
    expect(meta.desc).toBe("Direct relation");
  });

  it("falls back to parsing yaml and didactical reasons from raw file content", () => {
    const rawContent = `---
source_note: "[[Gamma]]"
target_note: "[[Delta]]"
relation_type: generalizes
bidirectional: false
---

## Didaktischer / Fachlicher Grund
This is the didactic reason
spanning multiple lines.
`;
    const meta = parseRelationMetadata(null, rawContent);
    expect(meta.rawSrc).toBe("Gamma");
    expect(meta.rawTgt).toBe("Delta");
    expect(meta.relType).toBe("GENERALIZES");
    expect(meta.bidirectional).toBe(false);
    expect(meta.desc).toBe("This is the didactic reason spanning multiple lines.");
  });
});

describe("relation-note identification (#173)", () => {
  const rel = (path: string, frontmatter: Record<string, unknown> = {}) => ({
    path,
    basename: path.replace(/^.*\//, "").replace(/\.md$/, ""),
    frontmatter: { source_note: "[[Alpha|Alpha]]", target_note: "[[Beta|Beta]]", relation_type: "REQUIRES", ...frontmatter },
  });
  const notes = [
    { path: "Alpha.md", basename: "Alpha" },
    { path: "Beta.md", basename: "Beta" },
  ];

  it("loads a relation note moved out of wiki/relations by its frontmatter type", async () => {
    const edges = await loadRelationEdges(fakeApp([...notes, rel("Beziehungen/moved.md", { type: "relation" })]));
    expect(edges).toHaveLength(1);
  });

  it("loads relation notes from a top-level relations folder when they carry the type", async () => {
    const edges = await loadRelationEdges(fakeApp([...notes, rel("relations/top.md", { type: "relation" })]));
    expect(edges).toHaveLength(1);
  });

  it("ignores notes in unrelated folders named like relations without the type", async () => {
    const edges = await loadRelationEdges(fakeApp([...notes, rel("Customers/relations/x.md"), rel("wiki/relationships/y.md")]));
    expect(edges).toHaveLength(0);
  });
});

describe("configured relations folder (#173)", () => {
  const untyped = (path: string) => ({
    path,
    basename: "r",
    frontmatter: { source_note: "[[Alpha|Alpha]]", target_note: "[[Beta|Beta]]", relation_type: "REQUIRES" },
  });
  const notes = [
    { path: "Alpha.md", basename: "Alpha" },
    { path: "Beta.md", basename: "Beta" },
  ];

  it("treats untyped notes in the configured folder as relations, and no longer those in wiki/relations", async () => {
    const app = fakeApp([...notes, untyped("Beziehungen/r.md"), untyped("wiki/relations/old.md")]);
    const edges = await loadRelationEdges(app, "", "Beziehungen");
    expect(edges.map((e) => e.path)).toEqual(["Beziehungen/r.md"]);
  });
});


describe("incomplete relation notes mark the load as partial (#203)", () => {
  it.each([
    ["missing target_note", { source_note: "[[Alpha]]", relation_type: "REQUIRES" }],
    ["missing source_note", { target_note: "[[Beta]]", relation_type: "REQUIRES" }],
    ["empty target link", { source_note: "[[Alpha]]", target_note: "[[]]", relation_type: "REQUIRES" }],
  ])("flags hasErrors and logs the path for %s", async (_label, frontmatter) => {
    const app = fakeApp([
      { path: "Alpha.md", basename: "Alpha" },
      { path: "Beta.md", basename: "Beta" },
      { path: "wiki/relations/rel.md", basename: "rel", frontmatter },
    ]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = await loadRelationFilesResult(app);
      expect(result.edges).toEqual([]);
      expect(result.hasErrors).toBe(true);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("wiki/relations/rel.md"));
    } finally {
      warn.mockRestore();
    }
  });

  it("does not flag a relation whose endpoint is excluded on purpose", async () => {
    const app = fakeApp([
      { path: "Alpha.md", basename: "Alpha" },
      { path: "Beta.md", basename: "Beta" },
      { path: "wiki/relations/rel.md", basename: "rel", frontmatter: { source_note: "[[Alpha]]", target_note: "[[Beta]]", relation_type: "REQUIRES" } },
    ]);
    const result = await loadRelationFilesResult(app, "-file:Beta");
    expect(result.edges).toEqual([]);
    expect(result.hasErrors).toBe(false);
  });

  it("does not flag complete relation notes", async () => {
    const app = fakeApp([
      { path: "Alpha.md", basename: "Alpha" },
      { path: "Beta.md", basename: "Beta" },
      { path: "wiki/relations/rel.md", basename: "rel", frontmatter: { source_note: "[[Alpha]]", target_note: "[[Beta]]", relation_type: "REQUIRES" } },
    ]);
    const result = await loadRelationFilesResult(app);
    expect(result.edges).toHaveLength(1);
    expect(result.hasErrors).toBe(false);
  });
});

describe("frontmatter typed links (#243)", () => {
  const LABELS = ["REQUIRES", "EQUIVALENT_TO"];
  const notes: FakeFile[] = [
    { path: "Matrix.md", basename: "Matrix" },
    { path: "Körper.md", basename: "Körper" },
    { path: "Gruppe.md", basename: "Gruppe" },
  ];

  it("reads <label> as confirmed and <label>_suggested as suggested edges", async () => {
    const app = fakeApp([
      ...notes,
      { path: "Vektorraum.md", basename: "Vektorraum",
        frontmatter: { requires: ["[[Matrix]]", "[[Körper|K]]"], requires_suggested: "[[Gruppe]]", tags: ["x"] } },
    ]);
    const edges = await loadRelationEdges(app, "", undefined, LABELS);
    const summary = edges.map((e) => [e.tgtId, e.relType, e.confidence, e.origin]);
    expect(summary).toEqual([
      [pathToId("Matrix.md"), "REQUIRES", "confirmed", "frontmatter"],
      [pathToId("Körper.md"), "REQUIRES", "confirmed", "frontmatter"],
      [pathToId("Gruppe.md"), "REQUIRES", "suggested", "frontmatter"],
    ]);
    expect(edges.every((e) => e.srcId === pathToId("Vektorraum.md") && e.path === "Vektorraum.md")).toBe(true);
  });

  it("reads nothing from frontmatter without labels, keeping the pre-#243 behavior", async () => {
    const app = fakeApp([...notes, { path: "V.md", basename: "V", frontmatter: { requires: ["[[Matrix]]"] } }]);
    expect(await loadRelationEdges(app)).toEqual([]);
  });

  it("covers every vocabulary label, not only requires", async () => {
    const app = fakeApp([...notes, { path: "V.md", basename: "V", frontmatter: { equivalent_to: "[[Matrix]]" } }]);
    const edges = await loadRelationEdges(app, "", undefined, LABELS);
    expect(edges.map((e) => e.relType)).toEqual(["EQUIVALENT_TO"]);
  });

  it("keeps one edge when a relation note and a frontmatter link describe it; the relation note wins", async () => {
    const app = fakeApp([
      ...notes,
      { path: "V.md", basename: "V", frontmatter: { requires: "[[Matrix]]" } },
      { path: "wiki/relations/r.md", basename: "r",
        frontmatter: { source_note: "[[V]]", target_note: "[[Matrix]]", relation_type: "REQUIRES", description: "why" } },
    ]);
    const edges = await loadRelationEdges(app, "", undefined, LABELS);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ path: "wiki/relations/r.md", desc: "why" });
    expect(edges[0].origin).toBeUndefined();
  });

  it("prefers a confirmed link over the same suggested one", async () => {
    const app = fakeApp([...notes, { path: "V.md", basename: "V",
      frontmatter: { requires_suggested: "[[Matrix]]", requires: "[[Matrix]]" } }]);
    const edges = await loadRelationEdges(app, "", undefined, LABELS);
    expect(edges.map((e) => e.confidence)).toEqual(["confirmed"]);
  });

  it("lets a bidirectional relation note cover the reverse frontmatter link", async () => {
    const app = fakeApp([
      ...notes,
      { path: "V.md", basename: "V", frontmatter: { equivalent_to: "[[Matrix]]" } },
      { path: "wiki/relations/r.md", basename: "r",
        frontmatter: { source_note: "[[Matrix]]", target_note: "[[V]]", relation_type: "EQUIVALENT_TO", bidirectional: true, description: "d" } },
    ]);
    const edges = await loadRelationEdges(app, "", undefined, LABELS);
    expect(edges.map((e) => e.path)).toEqual(["wiki/relations/r.md"]);
  });

  it("ignores typed-link keys inside relation notes", async () => {
    const app = fakeApp([
      ...notes,
      { path: "wiki/relations/r.md", basename: "r",
        frontmatter: { source_note: "[[Matrix]]", target_note: "[[Gruppe]]", relation_type: "REQUIRES", description: "d", requires: "[[Körper]]" } },
    ]);
    const edges = await loadRelationEdges(app, "", undefined, LABELS);
    expect(edges.map((e) => e.tgtId)).toEqual([pathToId("Gruppe.md")]);
  });
});
