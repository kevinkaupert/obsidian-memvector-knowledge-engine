import { describe, expect, it } from "vitest";
import { getTranslation } from "../../i18n";
import type { EnrichedNote } from "./contextEnrichment";
import { buildPreviewEntries } from "./contextPreview";

const t = getTranslation("de");

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
  it("shows hop distance for graph notes and similarity for vector notes", () => {
    const entries = buildPreviewEntries(
      [
        note({ id: "a", title: "aussage", sources: ["graph"], hops: 1 }),
        note({ id: "b", title: "menge", sources: ["vector"], similarity: 0.8123 }),
      ],
      t
    );
    expect(entries).toEqual([
      { title: "aussage", source: "[graph]", reason: "1 Hop" },
      { title: "menge", source: "[vector]", reason: "Ähnlichkeit 0.81" },
    ]);
  });

  it("combines both reasons and a combined source badge for dual-channel notes", () => {
    const entries = buildPreviewEntries(
      [note({ id: "a", title: "implikation", sources: ["vector", "graph"], hops: 2, similarity: 0.76 })],
      t
    );
    expect(entries[0].source).toBe("[vector+graph]");
    expect(entries[0].reason).toBe("2 Hops, Ähnlichkeit 0.76");
  });

  it("pluralizes the hop label", () => {
    const entries = buildPreviewEntries([note({ hops: 3 })], t);
    expect(entries[0].reason).toBe("3 Hops");
  });

  it("falls back to an empty reason when neither hops nor similarity are known", () => {
    const entries = buildPreviewEntries([note({})], t);
    expect(entries[0].reason).toBe("");
  });
});
