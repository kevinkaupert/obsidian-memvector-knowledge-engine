import { describe, expect, it } from "vitest";
import { buildRelationCategories } from "./buildCategories";
import { DEFAULT_RELATION_VOCABULARY } from "./defaultVocabulary";
import { defaultTermForLabel, resolveEdgesForSave } from "./resolveTerm";
import type { RelationEdgeDraft, RelationNode } from "../modals/relationBuilder/relationEdgeBuilder";

function makeNode(id: string): RelationNode {
  return { id, title: id, path: `${id}.md`, type: "concept" };
}

describe("relationVocabulary", () => {
  it("ships exactly one entry per canonical label - 13 canonical types plus Custom", () => {
    const categories = buildRelationCategories(DEFAULT_RELATION_VOCABULARY, "Frei");
    const allOptions = categories.flatMap((c) => c.items);
    const nonCustom = allOptions.filter((o) => o.val !== "CUSTOM");

    expect(DEFAULT_RELATION_VOCABULARY.length).toBe(13);
    expect(nonCustom.length).toBe(13);
    const expectedLabels = [
      "IMPLIES",
      "EQUIVALENT_TO",
      "CONFLICTS_WITH",
      "INDEPENDENT_OF",
      "REQUIRES",
      "GENERALIZES",
      "SPECIALIZES",
      "EXTENDS",
      "REDUCES_TO",
      "CONSTRUCTS",
      "EMBEDS_IN",
      "REFUTES",
      "ANALOGOUS_TO",
    ];
    expectedLabels.forEach((label) => {
      expect(nonCustom.some((o) => o.val === label && o.label === label)).toBe(true);
    });
  });

  it("encodes the legacy hardcoded layout weights as vocabulary fields (ADR-0002)", () => {
    const byLabel = new Map(DEFAULT_RELATION_VOCABULARY.map((d) => [d.label, d]));
    expect(byLabel.get("EQUIVALENT_TO")!.weight).toBe(1.3);
    expect(byLabel.get("ANALOGOUS_TO")!.weight).toBe(1.1);
    expect(byLabel.get("CONFLICTS_WITH")!.repels).toBe(true);
    expect(byLabel.get("INDEPENDENT_OF")!.weight).toBe(0.05);
  });

  it("defaultTermForLabel returns canonical label directly when passed an uppercase Cypher label", () => {
    expect(defaultTermForLabel(DEFAULT_RELATION_VOCABULARY, "SPECIALIZES")).toBe("SPECIALIZES");
    expect(defaultTermForLabel(DEFAULT_RELATION_VOCABULARY, "IMPLIES")).toBe("IMPLIES");
    expect(defaultTermForLabel(DEFAULT_RELATION_VOCABULARY, "REQUIRES")).toBe("REQUIRES");
    expect(defaultTermForLabel(DEFAULT_RELATION_VOCABULARY, "UNKNOWN_XYZ")).toBe(null);
  });

  it("resolveEdgesForSave cleanly resolves canonical labels without lossy remapping", () => {
    const edges: RelationEdgeDraft[] = [{ src: makeNode("nodeA"), tgt: makeNode("nodeB") }];
    const edgeRelTypes = { 0: "SPECIALIZES" };

    const resolved = resolveEdgesForSave(DEFAULT_RELATION_VOCABULARY, edges, edgeRelTypes, "");
    expect(resolved.length).toBe(1);
    expect(resolved[0].label).toBe("SPECIALIZES");
    expect(resolved[0].originalTerm).toBe("SPECIALIZES");
    expect(resolved[0].bidirectional).toBe(false);
    expect(resolved[0].src.id).toBe("nodeA");
    expect(resolved[0].tgt.id).toBe("nodeB");
  });

  it("resolveEdgesForSave retains bidirectional flag for bidirectional canonical types", () => {
    const edges: RelationEdgeDraft[] = [{ src: makeNode("nodeA"), tgt: makeNode("nodeB") }];
    const edgeRelTypes = { 0: "EQUIVALENT_TO" };

    const resolved = resolveEdgesForSave(DEFAULT_RELATION_VOCABULARY, edges, edgeRelTypes, "");
    expect(resolved.length).toBe(1);
    expect(resolved[0].label).toBe("EQUIVALENT_TO");
    expect(resolved[0].bidirectional).toBe(true);
  });

  it("resolveEdgesForSave treats unknown legacy keys as free-text custom labels instead of lossy remapping", () => {
    const edges: RelationEdgeDraft[] = [{ src: makeNode("nodeA"), tgt: makeNode("nodeB") }];
    const edgeRelTypes = { 0: "relFollowsFrom" };

    const resolved = resolveEdgesForSave(DEFAULT_RELATION_VOCABULARY, edges, edgeRelTypes, "");
    expect(resolved.length).toBe(1);
    // No legacy synonym entry exists anymore - the key is sanitized as-is.
    expect(resolved[0].label).toBe("RELFOLLOWSFROM");
    expect(resolved[0].src.id).toBe("nodeA");
    expect(resolved[0].tgt.id).toBe("nodeB");
  });

  it("resolveEdgesForSave honors reversed: true when matching canonical label from custom vocabulary", () => {
    const customVocab = [
      { key: "relDerivedFrom", label: "DERIVED_FROM", term: "derived from", category: "Lineage", bidirectional: false, reversed: true },
    ];
    const edges: RelationEdgeDraft[] = [{ src: makeNode("child"), tgt: makeNode("parent") }];
    const edgeRelTypes = { 0: "DERIVED_FROM" };

    const resolved = resolveEdgesForSave(customVocab, edges, edgeRelTypes, "");
    expect(resolved.length).toBe(1);
    expect(resolved[0].label).toBe("DERIVED_FROM");
    expect(resolved[0].originalTerm).toBe("DERIVED_FROM");
    // reversed flag on canonical definition in custom vocabulary swaps nodes
    expect(resolved[0].src.id).toBe("parent");
    expect(resolved[0].tgt.id).toBe("child");
  });

  it("resolveEdgesForSave falls back cleanly when key or label is unknown or CUSTOM", () => {
    const edges: RelationEdgeDraft[] = [{ src: makeNode("nodeA"), tgt: makeNode("nodeB") }];
    const edgeRelTypes = { 0: "CUSTOM" };

    const resolved = resolveEdgesForSave(DEFAULT_RELATION_VOCABULARY, edges, edgeRelTypes, "MY_CUSTOM_LINK");
    expect(resolved.length).toBe(1);
    expect(resolved[0].label).toBe("MY_CUSTOM_LINK");
    expect(resolved[0].originalTerm).toBe("MY_CUSTOM_LINK");
    expect(resolved[0].bidirectional).toBe(false);
    expect(resolved[0].src.id).toBe("nodeA");
    expect(resolved[0].tgt.id).toBe("nodeB");
  });

  it("resolves the default type for every batch edge while retaining per-edge overrides", () => {
    const edges = [
      { src: makeNode("a"), tgt: makeNode("b") },
      { src: makeNode("a"), tgt: makeNode("c") },
      { src: makeNode("a"), tgt: makeNode("d") },
    ];
    const resolved = resolveEdgesForSave(DEFAULT_RELATION_VOCABULARY, edges, { 1: "REQUIRES" }, "EQUIVALENT_TO");
    expect(resolved.map((e) => [e.label, e.bidirectional])).toEqual([
      ["EQUIVALENT_TO", true], ["REQUIRES", false], ["EQUIVALENT_TO", true],
    ]);
  });

  it("reverses when changing to a different reversed type during an edit, but preserves direction for unchanged types (Issue #108)", () => {
    const edges = [{ src: makeNode("a"), tgt: makeNode("b") }];
    const defs = [{ key: "backwards", label: "REVERSED", term: "backwards", category: "Test", reversed: true, bidirectional: false }];

    // Changed from REQUIRES to REVERSED: applies reversed direction
    const [changed] = resolveEdgesForSave(defs, edges, { 0: "REVERSED" }, "", "REQUIRES");
    expect([changed.src.id, changed.tgt.id]).toEqual(["b", "a"]);

    // Unchanged (even when editedCanonicalLabel was the legacy key): retains existing endpoints
    const [unchanged] = resolveEdgesForSave(defs, edges, { 0: "REVERSED" }, "", "backwards");
    expect([unchanged.src.id, unchanged.tgt.id]).toEqual(["a", "b"]);
  });

  it("defaultTermForLabel always returns canonical label for both canonical and legacy inputs", () => {
    expect(defaultTermForLabel(DEFAULT_RELATION_VOCABULARY, "relImplies")).toBe("IMPLIES");
    expect(defaultTermForLabel(DEFAULT_RELATION_VOCABULARY, "IMPLIES")).toBe("IMPLIES");
    expect(defaultTermForLabel(DEFAULT_RELATION_VOCABULARY, "unknown")).toBeNull();
  });

  it("keeps explicit CUSTOM input literal even when it matches a vocabulary label", () => {
    const defs = [{ key: "backwards", label: "REVERSED", term: "backwards", category: "Test", reversed: true, bidirectional: true }];
    const [resolved] = resolveEdgesForSave(defs, [{ src: makeNode("a"), tgt: makeNode("b") }], { 0: "CUSTOM" }, "REVERSED");
    expect([resolved.src.id, resolved.tgt.id, resolved.bidirectional]).toEqual(["a", "b", false]);
  });
});
