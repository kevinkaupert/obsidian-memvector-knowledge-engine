import { describe, expect, it } from "vitest";
import { buildConversationalCategories, buildRelationCategories } from "./buildCategories";
import { DEFAULT_RELATION_VOCABULARY } from "./defaultVocabulary";
import { defaultTermForLabel, resolveEdgesForSave } from "./resolveTerm";
import type { RelationEdgeDraft, RelationNode } from "../modals/relationBuilder/relationEdgeBuilder";

function makeNode(id: string): RelationNode {
  return { id, title: id, path: `${id}.md`, type: "concept" };
}

describe("relationVocabulary", () => {
  it("buildRelationCategories deduplicates 37 terms into exactly 13 canonical Cypher categories plus Custom", () => {
    const categories = buildRelationCategories(DEFAULT_RELATION_VOCABULARY, "Frei");
    const allOptions = categories.flatMap((c) => c.items);
    const nonCustom = allOptions.filter((o) => o.val !== "CUSTOM");

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

  it("buildConversationalCategories preserves the full 37 phrases for Issue #43 WIP", () => {
    const categories = buildConversationalCategories(DEFAULT_RELATION_VOCABULARY, "Frei");
    const allOptions = categories.flatMap((c) => c.items);
    const nonCustom = allOptions.filter((o) => o.val !== "CUSTOM");

    expect(nonCustom.length).toBe(37);
    expect(nonCustom.some((o) => o.val === "relCharacterizes" && o.label === "characterizes")).toBe(true);
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

  it("resolveEdgesForSave preserves backward compatibility with legacy/conversational keys", () => {
    const edges: RelationEdgeDraft[] = [{ src: makeNode("nodeA"), tgt: makeNode("nodeB") }];
    const edgeRelTypes = { 0: "relFollowsFrom" };

    const resolved = resolveEdgesForSave(DEFAULT_RELATION_VOCABULARY, edges, edgeRelTypes, "");
    expect(resolved.length).toBe(1);
    expect(resolved[0].label).toBe("IMPLIES");
    expect(resolved[0].originalTerm).toBe("follows from");
    // follows from reverses direction
    expect(resolved[0].src.id).toBe("nodeB");
    expect(resolved[0].tgt.id).toBe("nodeA");
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
});

