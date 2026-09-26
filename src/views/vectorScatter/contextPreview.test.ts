import { describe, expect, it } from "vitest";
import type { EnrichedNote } from "./contextEnrichment";
import { buildPreviewEntries, withoutDismissed } from "./contextPreview";

function note(partial: Partial<EnrichedNote>): EnrichedNote {
  return {
    id: "id",
    title: "title",
    path: "id.md",
    content: "",
    sources: ["graph"],
    ...partial,
  };
}

describe("buildPreviewEntries (Issue #103 context preview)", () => {
  it("shows hop distance for graph notes and bare similarity for vector notes", () => {
    const { traversed } = buildPreviewEntries([
      note({ id: "a", title: "aussage", sources: ["graph"], hops: 1 }),
      note({ id: "b", title: "menge", sources: ["vector"], similarity: 0.8123 }),
    ]);
    expect(traversed).toEqual([
      { id: "a", title: "aussage", kind: "traversed", source: "g", reason: "1 Hop" },
      { id: "b", title: "menge", kind: "traversed", source: "v", reason: "0.81" },
    ]);
  });

  it("combines both reasons and a compact v+g badge for dual-channel notes", () => {
    const { traversed } = buildPreviewEntries([
      note({ id: "a", title: "implikation", sources: ["vector", "graph"], hops: 2, similarity: 0.76 }),
    ]);
    expect(traversed[0].source).toBe("v+g");
    expect(traversed[0].reason).toBe("0.76  2 Hops");
  });

  it("pluralizes the hop label", () => {
    expect(buildPreviewEntries([note({ hops: 3 })]).traversed[0].reason).toBe("3 Hops");
    expect(buildPreviewEntries([note({ hops: 1 })]).traversed[0].reason).toBe("1 Hop");
  });

  it("falls back to an empty reason when neither hops nor similarity are known", () => {
    expect(buildPreviewEntries([note({})]).traversed[0].reason).toBe("");
  });
});

describe("buildPreviewEntries seed section (Issue #117)", () => {
  it("pins directly selected seed notes into a separate seed group with the seed badge", () => {
    const { seeds, traversed, total } = buildPreviewEntries(
      [note({ id: "n1", title: "Theorem", sources: ["graph"], hops: 1 })],
      [
        { id: "s1", title: "Concept Alpha" },
        { id: "s2", title: "Definition Beta" },
      ]
    );

    expect(seeds).toEqual([
      { id: "s1", title: "Concept Alpha", kind: "seed", source: "seed", reason: "" },
      { id: "s2", title: "Definition Beta", kind: "seed", source: "seed", reason: "" },
    ]);
    expect(traversed).toHaveLength(1);
    expect(total).toBe(3);
  });

  it("keeps seeds empty and total aligned when nothing is selected", () => {
    const { seeds, traversed, total } = buildPreviewEntries([note({})], []);
    expect(seeds).toEqual([]);
    expect(traversed).toHaveLength(1);
    expect(total).toBe(1);
  });

  it("counts the full context including seeds", () => {
    const { total } = buildPreviewEntries([], [{ id: "s1", title: "Only" }]);
    expect(total).toBe(1);
  });
});

describe("withoutDismissed (Issue #116)", () => {
  const sections = buildPreviewEntries(
    [
      note({ id: "n1", title: "Theorem", sources: ["graph"], hops: 1 }),
      note({ id: "n2", title: "Axiom", sources: ["vector"], similarity: 0.9 }),
    ],
    [{ id: "s1", title: "Concept" }]
  );

  it("removes dismissed traversed notes and recomputes the total", () => {
    const filtered = withoutDismissed(sections, new Set(["n1"]));
    expect(filtered.traversed.map((e) => e.id)).toEqual(["n2"]);
    expect(filtered.total).toBe(2);
  });

  it("never filters seed notes, even when their id is dismissed", () => {
    const filtered = withoutDismissed(sections, new Set(["s1"]));
    expect(filtered.seeds.map((e) => e.id)).toEqual(["s1"]);
    expect(filtered.total).toBe(3);
  });

  it("returns an empty traversed group when everything is dismissed", () => {
    const filtered = withoutDismissed(sections, new Set(["n1", "n2"]));
    expect(filtered.traversed).toEqual([]);
    expect(filtered.total).toBe(1);
  });
});
