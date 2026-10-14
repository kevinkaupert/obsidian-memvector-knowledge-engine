import { describe, expect, it } from "vitest";
import { buildLinkKeys, confirmedEdges, hasLinkKeys, linkTextsOf } from "./frontmatterLinks";
import type { RelationEdge } from "./views/vectorScatter/types";

describe("frontmatter link keys (#243)", () => {
  it("maps each label to a confirmed key and a _suggested key", () => {
    const keys = buildLinkKeys(["REQUIRES", "equivalent_to", " "]);
    expect([...keys.entries()]).toEqual([
      ["requires", { label: "REQUIRES", confidence: "confirmed" }],
      ["requires_suggested", { label: "REQUIRES", confidence: "suggested" }],
      ["equivalent_to", { label: "EQUIVALENT_TO", confidence: "confirmed" }],
      ["equivalent_to_suggested", { label: "EQUIVALENT_TO", confidence: "suggested" }],
    ]);
  });

  it("detects typed-link keys in frontmatter", () => {
    const keys = buildLinkKeys(["REQUIRES"]);
    expect(hasLinkKeys({ requires_suggested: [] }, keys)).toBe(true);
    expect(hasLinkKeys({ tags: ["a"] }, keys)).toBe(false);
    expect(hasLinkKeys(undefined, keys)).toBe(false);
  });

  it("extracts link texts from a single link or a list, dropping aliases, headings and non-strings", () => {
    expect(linkTextsOf("[[Körper|K]]")).toEqual(["Körper"]);
    expect(linkTextsOf(["[[A#Teil]]", "B", 3, null, "[[ ]]"])).toEqual(["A", "B"]);
    expect(linkTextsOf(undefined)).toEqual([]);
  });

  it("keeps everything but suggested edges as confirmed knowledge", () => {
    const edge = (confidence?: RelationEdge["confidence"]) =>
      ({ srcId: "a", tgtId: "b", relType: "REQUIRES", desc: "", title: "", path: "a.md", bidirectional: false, confidence }) as RelationEdge;
    expect(confirmedEdges([edge(), edge("confirmed"), edge("suggested")]).map((e) => e.confidence)).toEqual([undefined, "confirmed"]);
  });
});
