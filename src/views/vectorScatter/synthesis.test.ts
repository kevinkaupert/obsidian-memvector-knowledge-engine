import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
  Modal: class {},
  Notice: class {},
  TFile: class {},
}));

import {
  buildPrompt,
  buildRelationEdgesSection,
  findRelevantRelationEdges,
  type SynthesisNoteContent,
} from "./synthesis";
import type { RelationEdge } from "./types";
import type { EnrichedNote } from "./contextEnrichment";

function makeNote(id: string, title: string, fullContent = "Test content"): SynthesisNoteContent {
  return {
    id,
    title,
    path: `${id}.md`,
    basenameKey: id.split("/").pop() || id,
    content: fullContent,
    fullContent,
    type: "concept",
    x: 0,
    y: 0,
    latexFormulas: [],
    links: [],
  };
}

function makeEnrichedNote(id: string, title: string, content = "Enriched content"): EnrichedNote {
  return {
    id,
    title,
    path: `${id}.md`,
    content,
    sources: ["graph"],
    hops: 1,
  };
}

function makeEdge(
  srcId: string,
  tgtId: string,
  relType: string,
  desc = "",
  bidirectional = false
): RelationEdge {
  return {
    srcId,
    tgtId,
    relType,
    desc,
    title: `${srcId} -> ${tgtId}`,
    path: `wiki/relations/${srcId}-${tgtId}.md`,
    bidirectional,
  };
}

describe("findRelevantRelationEdges (#104)", () => {
  it("filters edges where both endpoints are in activeNodeIds", () => {
    const activeIds = new Set(["node-a", "node-b"]);
    const edges: RelationEdge[] = [
      makeEdge("node-a", "node-b", "IMPLIES"),
      makeEdge("node-a", "node-c", "REQUIRES"),
      makeEdge("node-x", "node-y", "CONFLICTS_WITH"),
    ];

    const relevant = findRelevantRelationEdges(edges, activeIds);
    expect(relevant).toHaveLength(1);
    expect(relevant[0].relType).toBe("IMPLIES");
  });

  it("handles case-insensitive node ID matching", () => {
    const activeIds = new Set(["wiki/concepts/group", "wiki/concepts/field"]);
    const edges: RelationEdge[] = [
      makeEdge("Wiki/Concepts/Group", "wiki/concepts/field", "SPECIALIZES"),
    ];

    const relevant = findRelevantRelationEdges(edges, activeIds);
    expect(relevant).toHaveLength(1);
    expect(relevant[0].relType).toBe("SPECIALIZES");
  });

  it("ignores self-loops", () => {
    const activeIds = new Set(["node-a"]);
    const edges: RelationEdge[] = [makeEdge("node-a", "node-a", "RELATES_TO")];

    const relevant = findRelevantRelationEdges(edges, activeIds);
    expect(relevant).toHaveLength(0);
  });

  it("deduplicates redundant bidirectional edges", () => {
    const activeIds = new Set(["node-a", "node-b"]);
    const edges: RelationEdge[] = [
      makeEdge("node-a", "node-b", "EQUIVALENT_TO", "Same concept", true),
      makeEdge("node-b", "node-a", "EQUIVALENT_TO", "Same concept", true),
    ];

    const relevant = findRelevantRelationEdges(edges, activeIds);
    expect(relevant).toHaveLength(1);
    expect(relevant[0].srcId).toBe("node-a");
  });

  it("deduplicates identical directed edges", () => {
    const activeIds = new Set(["node-a", "node-b"]);
    const edges: RelationEdge[] = [
      makeEdge("node-a", "node-b", "IMPLIES"),
      makeEdge("node-a", "node-b", "IMPLIES"),
    ];

    const relevant = findRelevantRelationEdges(edges, activeIds);
    expect(relevant).toHaveLength(1);
  });
});

describe("buildRelationEdgesSection (#104)", () => {
  it("returns empty string when there are no relation edges", () => {
    const titleMap = new Map<string, string>();
    expect(buildRelationEdgesSection([], titleMap, "de")).toBe("");
    expect(buildRelationEdgesSection([], titleMap, "en")).toBe("");
  });

  it("formats directed edges with titles and German reason heading", () => {
    const edges = [
      makeEdge("wiki/concepts/group", "wiki/concepts/monoid", "SPECIALIZES", "Jede Gruppe ist ein Monoid"),
    ];
    const titleMap = new Map([
      ["wiki/concepts/group", "Gruppe"],
      ["wiki/concepts/monoid", "Monoid"],
    ]);

    const section = buildRelationEdgesSection(edges, titleMap, "de");
    expect(section).toContain("### Explizite Wissensbeziehungen:");
    expect(section).toContain("- [[Gruppe]] --[SPECIALIZES]--> [[Monoid]] (Grund: Jede Gruppe ist ein Monoid)");
  });

  it("formats bidirectional edges and English reason heading", () => {
    const edges = [
      makeEdge("concept-a", "concept-b", "ISOMORPHIC_TO", "Structural equivalence", true),
    ];
    const titleMap = new Map([
      ["concept-a", "Concept A"],
      ["concept-b", "Concept B"],
    ]);

    const section = buildRelationEdgesSection(edges, titleMap, "en");
    expect(section).toContain("### Explicit Knowledge Graph Relations:");
    expect(section).toContain("- [[Concept A]] <--[ISOMORPHIC_TO]--> [[Concept B]] (Reason: Structural equivalence)");
  });

  it("omits reason suffix when description is empty or whitespace", () => {
    const edges = [makeEdge("a", "b", "REQUIRES", "   ")];
    const titleMap = new Map([
      ["a", "Note A"],
      ["b", "Note B"],
    ]);

    const section = buildRelationEdgesSection(edges, titleMap, "de");
    expect(section).toContain("- [[Note A]] --[REQUIRES]--> [[Note B]]");
    expect(section).not.toContain("Grund");
  });
});

describe("buildPrompt with relation edges (#104)", () => {
  const note1 = makeNote("wiki/concepts/group", "Gruppe", "Definition einer Gruppe.");
  const note2 = makeNote("wiki/concepts/field", "Körper", "Definition eines Körpers.");
  const enriched = makeEnrichedNote("wiki/concepts/ring", "Ring", "Definition eines Rings.");

  it("cleanly omits relation edges section when no relations are provided", () => {
    const promptDe = buildPrompt([note1, note2], false, "de", "auf Deutsch", 500);
    expect(promptDe).not.toContain("Explizite Wissensbeziehungen");
    expect(promptDe).not.toContain("Explicit Knowledge Graph Relations");

    const promptEn = buildPrompt([note1, note2], false, "en", "in English", 500);
    expect(promptEn).not.toContain("Explizite Wissensbeziehungen");
    expect(promptEn).not.toContain("Explicit Knowledge Graph Relations");
  });

  it("includes formatted relations between selected notes and enriched neighbors", () => {
    const edges: RelationEdge[] = [
      makeEdge("wiki/concepts/group", "wiki/concepts/field", "PREREQUISITE_FOR", "Körper erfordert additive Gruppe"),
      makeEdge("wiki/concepts/field", "wiki/concepts/ring", "EXTENDS", "Ein Körper ist ein kommutativer Divisionsring"),
    ];

    const prompt = buildPrompt(
      [note1, note2],
      false,
      "de",
      "auf Deutsch",
      500,
      undefined,
      [enriched],
      false,
      edges
    );

    expect(prompt).toContain("### Explizite Wissensbeziehungen:");
    expect(prompt).toContain("- [[Gruppe]] --[PREREQUISITE_FOR]--> [[Körper]] (Grund: Körper erfordert additive Gruppe)");
    expect(prompt).toContain("- [[Körper]] --[EXTENDS]--> [[Ring]] (Grund: Ein Körper ist ein kommutativer Divisionsring)");
  });

  it("integrates relation edges cleanly into custom question prompts", () => {
    const edges: RelationEdge[] = [
      makeEdge("wiki/concepts/group", "wiki/concepts/field", "RELATES_TO"),
    ];

    const prompt = buildPrompt(
      [note1, note2],
      false,
      "en",
      "in English",
      500,
      "How do these algebra concepts connect?",
      [],
      false,
      edges
    );

    expect(prompt).toContain("How do these algebra concepts connect?");
    expect(prompt).toContain("### Explicit Knowledge Graph Relations:");
    expect(prompt).toContain("- [[Gruppe]] --[RELATES_TO]--> [[Körper]]");
  });

  it("integrates relation edges into math mode prompts", () => {
    const edges: RelationEdge[] = [
      makeEdge("wiki/concepts/group", "wiki/concepts/field", "IMPLIES", "Group structure is required", false),
    ];

    const prompt = buildPrompt(
      [note1, note2],
      true,
      "de",
      "auf Deutsch",
      500,
      undefined,
      [],
      true,
      edges
    );

    expect(prompt).toContain("Du bist ein mathematischer Tutor");
    expect(prompt).toContain("### Explizite Wissensbeziehungen:");
    expect(prompt).toContain("- [[Gruppe]] --[IMPLIES]--> [[Körper]] (Grund: Group structure is required)");
  });
});
