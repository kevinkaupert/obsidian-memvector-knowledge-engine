import { describe, expect, it } from "vitest";
import type { EnrichedNote } from "./contextEnrichment";
import { buildPreviewEntries } from "./contextPreview";

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
      { id: "s1", title: "Concept Alpha", kind: "seed", source: "", reason: "" },
      { id: "s2", title: "Definition Beta", kind: "seed", source: "", reason: "" },
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

describe("dismissed notes and hop labels", () => {
  it("shapes only what enrichContext returned, so a dismissed note cannot reappear (Issue #116)", () => {
    // enrichContext applies excludeIds itself; the preview must not re-derive the
    // list from anywhere else, or preview and synthesis payload could drift apart.
    const enrichedWithoutDismissed = [note({ id: "n2", title: "Axiom", sources: ["vector"], similarity: 0.9 })];
    const { traversed, total } = buildPreviewEntries(enrichedWithoutDismissed, [{ id: "s1", title: "Concept" }]);
    expect(traversed.map((e) => e.id)).toEqual(["n2"]);
    expect(total).toBe(2);
  });

  it("uses the injected hop wording instead of a hardcoded label", () => {
    const { traversed } = buildPreviewEntries(
      [note({ id: "n1", title: "Theorem", sources: ["graph"], hops: 1 }), note({ id: "n2", title: "Lemma", sources: ["graph"], hops: 2 })],
      [],
      { single: "Sprung", plural: "Spruenge" }
    );
    expect(traversed[0].reason).toBe("1 Sprung");
    expect(traversed[1].reason).toBe("2 Spruenge");
  });
});

describe("preview rows carry no untranslated UI text", () => {
  it("leaves seed rows without meta text, since the localized badge already marks them", () => {
    const { seeds } = buildPreviewEntries([], [{ id: "s1", title: "Concept Alpha" }]);
    expect(seeds[0].source).toBe("");
    expect(seeds[0].reason).toBe("");
  });

  it("only ever emits the compact provenance codes, never a translatable word", () => {
    const { seeds, traversed } = buildPreviewEntries(
      [
        note({ id: "a", title: "a", sources: ["graph"], hops: 1 }),
        note({ id: "b", title: "b", sources: ["vector"], similarity: 0.5 }),
        note({ id: "c", title: "c", sources: ["vector", "graph"], hops: 2, similarity: 0.5 }),
      ],
      [{ id: "s1", title: "Concept Alpha" }]
    );
    for (const entry of [...seeds, ...traversed]) {
      expect(["", "v", "g", "v+g"]).toContain(entry.source);
    }
  });

  it("takes the hop wording from the caller rather than hardcoding it", () => {
    const { traversed } = buildPreviewEntries([note({ id: "a", title: "a", sources: ["graph"], hops: 2 })], [], {
      single: "Sprung",
      plural: "Spruenge",
    });
    expect(traversed[0].reason).toBe("2 Spruenge");
  });
});
