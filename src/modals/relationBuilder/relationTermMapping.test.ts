import { describe, expect, it } from "vitest";
import { getTranslation } from "../../i18n";
import { defaultTermForLabel, resolveEdgesForSave, resolveRelationTerm } from "./relationTermMapping";
import type { RelationEdgeDraft, RelationNode } from "./relationEdgeBuilder";

function node(id: string): RelationNode {
  return { id, title: id, path: `${id}.md`, type: "definition" };
}

describe("resolveRelationTerm", () => {
  it("resolves a plain forward term", () => {
    expect(resolveRelationTerm("relImplies")).toEqual({ label: "IMPLIES", bidirectional: false, reversed: false });
  });

  it("resolves a reversed term ('folgt aus' means B implies A)", () => {
    expect(resolveRelationTerm("relFollowsFrom")).toEqual({ label: "IMPLIES", bidirectional: false, reversed: true });
  });

  it("resolves a bidirectional term", () => {
    expect(resolveRelationTerm("relEquivalentTo")).toEqual({ label: "EQUIVALENT_TO", bidirectional: true, reversed: false });
  });

  it("returns null for an unknown key", () => {
    expect(resolveRelationTerm("relDoesNotExist")).toBeNull();
  });
});

describe("defaultTermForLabel", () => {
  it("finds a representative term for a known canonical label", () => {
    expect(resolveRelationTerm(defaultTermForLabel("REQUIRES")!)?.label).toBe("REQUIRES");
  });

  it("is case-insensitive", () => {
    expect(defaultTermForLabel("requires")).not.toBeNull();
  });

  it("returns null for a label outside the 13-term vocabulary (old relation files)", () => {
    expect(defaultTermForLabel("IS_OPPOSITE_OF")).toBeNull();
  });
});

describe("resolveEdgesForSave", () => {
  const a = node("a");
  const b = node("b");
  const edges: RelationEdgeDraft[] = [{ src: a, tgt: b }];
  const t = getTranslation("de");

  it("keeps direction and carries the display term for a forward term", () => {
    const [resolved] = resolveEdgesForSave(edges, { 0: "relImplies" }, "", t);
    expect(resolved).toEqual({ src: a, tgt: b, label: "IMPLIES", bidirectional: false, originalTerm: t.relImplies });
  });

  it("swaps src/tgt for a reversed term", () => {
    const [resolved] = resolveEdgesForSave(edges, { 0: "relFollowsFrom" }, "", t);
    expect(resolved.src).toBe(b);
    expect(resolved.tgt).toBe(a);
    expect(resolved.label).toBe("IMPLIES");
  });

  it("carries bidirectional through for an equivalence term", () => {
    const [resolved] = resolveEdgesForSave(edges, { 0: "relEquivalentTo" }, "", t);
    expect(resolved.bidirectional).toBe(true);
  });

  it("falls back to a sanitized custom type with no swap/bidirectional when CUSTOM is chosen", () => {
    const [resolved] = resolveEdgesForSave(edges, { 0: "CUSTOM" }, "is homomorphic to", t);
    expect(resolved).toEqual({ src: a, tgt: b, label: "IS_HOMOMORPHIC_TO", bidirectional: false, originalTerm: "is homomorphic to" });
  });

  it("treats an unrecognized dropdown value the same as custom (defensive fallback)", () => {
    const [resolved] = resolveEdgesForSave(edges, { 0: "relNoLongerExists" }, "", t);
    expect(resolved.label).toBe("RELNOLONGEREXISTS");
    expect(resolved.bidirectional).toBe(false);
  });
});
