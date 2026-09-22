import { describe, expect, it } from "vitest";
import { pathToId } from "../../noteSlug";
import { getTranslation } from "../../i18n";
import type { ResolvedRelationEdge } from "../../relationVocabulary/resolveTerm";
import { buildRelationFileContent, relationFilePath, relationFilePaths } from "./relationFileTemplate";

function edge(overrides: Partial<ResolvedRelationEdge> = {}): ResolvedRelationEdge {
  return {
    src: { id: "work-overview", title: "Overview", path: "Work/Overview.md", type: "concept" },
    tgt: { id: "home-overview", title: "Overview", path: "Home/Overview.md", type: "concept" },
    label: "REQUIRES",
    bidirectional: false,
    originalTerm: "requires",
    ...overrides,
  };
}

describe("buildRelationFileContent", () => {
  it("writes WikiLink targets as the note's real path, never the canonical (slugged) id", () => {
    const content = buildRelationFileContent(edge(), "", getTranslation("de"));

    expect(content).toContain('source_note: "[[Work/Overview|Overview]]"');
    expect(content).toContain('target_note: "[[Home/Overview|Overview]]"');
    expect(content).not.toContain("work-overview");
    expect(content).not.toContain("home-overview");
  });
});

describe("relationFilePath", () => {
  it("stays distinct for same-basename source/target pairs in different folders", async () => {
    const a = await relationFilePath(edge());
    const b = await relationFilePath(
      edge({
        src: { id: "other-overview", title: "Overview", path: "Other/Overview.md", type: "concept" },
      })
    );
    expect(a).not.toBe(b);
  });

  it("stays distinct for two different relation types between the same ordered pair (F06)", async () => {
    const requires = await relationFilePath(edge({ label: "REQUIRES" }));
    const conflicts = await relationFilePath(edge({ label: "CONFLICTS_WITH" }));
    expect(requires).not.toBe(conflicts);
  });

  it("is stable for the same edge (idempotent, so re-saving without a type/direction change targets the same file)", async () => {
    expect(await relationFilePath(edge())).toBe(await relationFilePath(edge()));
  });
});


describe("relation filename identity (#74)", () => {
  it.each(["src", "tgt"] as const)("distinguishes folder separators and punctuation in %s", async (endpoint) => {
    const paths = ["Work/Overview.md", "Work-Overview.md", "Work Overview.md", "Work%Overview.md"];
    const filenames = await Promise.all(paths.map((path) => relationFilePath(edge({
      [endpoint]: { ...edge()[endpoint], id: pathToId(path), path },
    }))));
    expect(new Set(filenames).size).toBe(paths.length);
  });

  it("distinguishes ambiguous boundaries between source and target slugs", async () => {
    const a = edge({ src: { ...edge().src, id: "a-to-b" }, tgt: { ...edge().tgt, id: "c" } });
    const b = edge({ src: { ...edge().src, id: "a" }, tgt: { ...edge().tgt, id: "b-to-c" } });
    expect(await relationFilePath(a)).not.toBe(await relationFilePath(b));
  });

  it("distinguishes labels with the same slug and reversed endpoints", async () => {
    expect(await relationFilePath(edge({ label: "A_B" }))).not.toBe(await relationFilePath(edge({ label: "A-B" })));
    expect(await relationFilePath(edge())).not.toBe(await relationFilePath(edge({ src: edge().tgt, tgt: edge().src })));
  });

  it("bounds filename length and retains identity beyond the readable prefix", async () => {
    const prefix = "very-long-folder/".repeat(40);
    const a = await relationFilePath(edge({ src: { ...edge().src, id: `${prefix}a` }, label: "CUSTOM_".repeat(100) }));
    const b = await relationFilePath(edge({ src: { ...edge().src, id: `${prefix}b` }, label: "CUSTOM_".repeat(100) }));
    expect(a).not.toBe(b);
    const basename = a.split("/").pop()!;
    expect(basename.length).toBeLessThan(255);
    expect(basename).toMatch(/^rel-[a-z0-9-]+-[a-f0-9]{64}\.md$/);
  });

  const legacy = {
    srcId: edge().src.id, tgtId: edge().tgt.id, relType: edge().label,
    path: "wiki/relations/rel-work-overview-to-home-overview-requires.md",
  };

  it("reuses a legacy path for edits and duplicate detection", async () => {
    expect(await relationFilePaths([edge()], [legacy], legacy.path)).toEqual([legacy.path]);
    expect(await relationFilePaths([edge()], [legacy])).toEqual([legacy.path]);
  });

  it("does not reuse another relation's colliding legacy slug", async () => {
    const other = edge({ src: { ...edge().src, id: "work/overview", path: "Work/Overview.md" } });
    expect(await relationFilePaths([other], [legacy])).toEqual([await relationFilePath(other)]);
    expect(await relationFilePath(other)).not.toBe(legacy.path);
  });

  it("recognizes an existing target relation on type change", async () => {
    const changed = edge({ label: "PROVES" });
    const occupied = { ...legacy, relType: "PROVES", path: "wiki/relations/already-proves.md" };
    expect(await relationFilePaths([changed], [legacy, occupied], legacy.path)).toEqual([occupied.path]);
  });

  it("prefers a conflicting duplicate file over allowing an in-place edit", async () => {
    const duplicate = { ...legacy, path: "wiki/relations/duplicate.md" };
    expect(await relationFilePaths([edge()], [legacy, duplicate], legacy.path)).toEqual([duplicate.path]);
  });
});
