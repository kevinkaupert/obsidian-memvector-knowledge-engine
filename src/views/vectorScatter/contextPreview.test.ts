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
    const entries = buildPreviewEntries([
      note({ id: "a", title: "aussage", sources: ["graph"], hops: 1 }),
      note({ id: "b", title: "menge", sources: ["vector"], similarity: 0.8123 }),
    ]);
    expect(entries).toEqual([
      { title: "aussage", source: "g", reason: "1 Hop" },
      { title: "menge", source: "v", reason: "0.81" },
    ]);
  });

  it("combines both reasons and a compact v+g badge for dual-channel notes", () => {
    const entries = buildPreviewEntries([
      note({ id: "a", title: "implikation", sources: ["vector", "graph"], hops: 2, similarity: 0.76 }),
    ]);
    expect(entries[0].source).toBe("v+g");
    expect(entries[0].reason).toBe("0.76  2 Hops");
  });

  it("pluralizes the hop label", () => {
    expect(buildPreviewEntries([note({ hops: 3 })])[0].reason).toBe("3 Hops");
    expect(buildPreviewEntries([note({ hops: 1 })])[0].reason).toBe("1 Hop");
  });

  it("falls back to an empty reason when neither hops nor similarity are known", () => {
    expect(buildPreviewEntries([note({})])[0].reason).toBe("");
  });
});
