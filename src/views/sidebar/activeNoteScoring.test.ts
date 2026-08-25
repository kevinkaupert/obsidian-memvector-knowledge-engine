import { describe, expect, it } from "vitest";
import { classifyNoteType, extractFormulas, extractWords, rankCandidates, shouldExcludeFromRadar } from "./activeNoteScoring";

describe("shouldExcludeFromRadar", () => {
  it("excludes files whose path contains 'schema'", () => {
    expect(shouldExcludeFromRadar({ path: "schema/foo.md", name: "foo.md", basename: "foo" })).toBe(true);
  });

  it("excludes files whose name matches a known housekeeping substring", () => {
    expect(shouldExcludeFromRadar({ path: "wiki/README.md", name: "README.md", basename: "README" })).toBe(true);
    expect(shouldExcludeFromRadar({ path: "wiki/log.md", name: "log.md", basename: "log" })).toBe(true);
  });

  it("keeps ordinary notes", () => {
    expect(shouldExcludeFromRadar({ path: "wiki/definitions/koerper.md", name: "koerper.md", basename: "koerper" })).toBe(false);
  });
});

describe("classifyNoteType", () => {
  it("classifies by folder convention first", () => {
    expect(classifyNoteType("wiki/definitions/koerper.md", "koerper.md")).toBe("definition");
    expect(classifyNoteType("wiki/theorems/satz-1.md", "satz-1.md")).toBe("theorem");
    expect(classifyNoteType("wiki/relations/rel-a-b.md", "rel-a-b.md")).toBe("relation");
  });

  it("defaults to concept", () => {
    expect(classifyNoteType("wiki/misc/foo.md", "foo.md")).toBe("concept");
  });
});

describe("extractWords / extractFormulas", () => {
  it("extracts lowercase 3+ char ASCII word tokens (non-ASCII like umlauts break a word at that character, matching the original regex)", () => {
    expect(extractWords("Ein Ring ist eine Menge")).toEqual(new Set(["ein", "ring", "ist", "eine", "menge"]));
  });

  it("extracts LaTeX formula bodies between $ delimiters", () => {
    expect(extractFormulas("Es gilt $a + b = c$ und $$x^2$$")).toEqual(["a + b = c", "x^2"]);
  });
});

describe("rankCandidates", () => {
  it("ranks a near-duplicate note above an unrelated one", () => {
    const active = "Ein Körper ist eine Menge mit zwei Verknüpfungen Addition Multiplikation";
    const candidates = [
      { file: { path: "a.md", name: "a.md", basename: "a" }, content: "Ein Körper ist eine Menge mit zwei Verknüpfungen" },
      { file: { path: "b.md", name: "b.md", basename: "b" }, content: "Katzen sind Tiere die schnurren" },
    ];

    const ranked = rankCandidates(active, candidates);
    expect(ranked[0].file.basename).toBe("a");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("returns a score of 0 for entirely disjoint content", () => {
    const ranked = rankCandidates("abc def ghi", [{ file: { path: "x.md", name: "x.md", basename: "x" }, content: "jkl mno pqr" }]);
    expect(ranked[0].score).toBe(0);
  });
});
