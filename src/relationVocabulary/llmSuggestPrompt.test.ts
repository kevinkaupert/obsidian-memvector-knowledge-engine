import { describe, expect, it } from "vitest";
import { buildEdgeSuggestionPrompt, buildEdgeVerificationPrompt, parseEdgeSuggestion, parseEdgeVerification, suggestableLabels } from "./llmSuggestPrompt";
import type { RelationTermDef } from "./types";

const defs: RelationTermDef[] = [
  { key: "a", label: "IMPLIES", term: "implies", category: "Logic", bidirectional: false, reversed: false, suggest: true },
  { key: "b", label: "IMPLIES", term: "proves", category: "Logic", bidirectional: false, reversed: false, suggest: true },
  { key: "c", label: "EQUIVALENT_TO", term: "equivalent to", category: "Logic", bidirectional: true, reversed: false, suggest: true },
  { key: "d", label: "GENERALIZES", term: "generalizes", category: "Logic", bidirectional: false, reversed: false },
];

const noFlags: RelationTermDef[] = [
  { key: "x", label: "TREATS", term: "treats", category: "Clinical", bidirectional: false, reversed: false },
  { key: "y", label: "CONTRAINDICATED_WITH", term: "contraindicated with", category: "Clinical", bidirectional: true, reversed: false },
];

describe("suggestableLabels", () => {
  it("dedupes to the suggest:true subset by label", () => {
    expect(suggestableLabels(defs)).toEqual([
      { label: "IMPLIES", hint: "implies" },
      { label: "EQUIVALENT_TO", hint: "equivalent to" },
    ]);
  });

  it("falls back to every unique label when nothing opts in", () => {
    expect(suggestableLabels(noFlags)).toEqual([
      { label: "TREATS", hint: "treats" },
      { label: "CONTRAINDICATED_WITH", hint: "contraindicated with" },
    ]);
  });
});

describe("buildEdgeSuggestionPrompt", () => {
  it("lists only the suggestable labels, not the full vocabulary", () => {
    const prompt = buildEdgeSuggestionPrompt(defs, "A", "excerpt A", "B", "excerpt B");
    expect(prompt).toContain("IMPLIES");
    expect(prompt).toContain("EQUIVALENT_TO");
    expect(prompt).not.toContain("GENERALIZES");
  });

  it("works for a domain-neutral vocabulary with no suggest flags", () => {
    const prompt = buildEdgeSuggestionPrompt(noFlags, "Drug X", "excerpt", "Drug Y", "excerpt");
    expect(prompt).toContain("TREATS");
    expect(prompt).toContain("CONTRAINDICATED_WITH");
  });
});

describe("parseEdgeSuggestion", () => {
  const allowed = ["IMPLIES", "EQUIVALENT_TO"];

  it("parses a well-formed response", () => {
    const raw = "LABEL: IMPLIES\nREASON: A directly yields B.\nCOUNTEREXAMPLE: None";
    expect(parseEdgeSuggestion(raw, allowed)).toEqual({ label: "IMPLIES", reason: "A directly yields B.", counterexample: null });
  });

  it("tolerates a preceding <think> block from reasoning models", () => {
    const raw = "<think>lots of reasoning here...</think>\nLABEL: EQUIVALENT_TO\nREASON: Same statement.\nCOUNTEREXAMPLE: None";
    expect(parseEdgeSuggestion(raw, allowed)?.label).toBe("EQUIVALENT_TO");
  });

  it("returns a counterexample when present", () => {
    const raw = "LABEL: IMPLIES\nREASON: x\nCOUNTEREXAMPLE: n=4 fails";
    expect(parseEdgeSuggestion(raw, allowed)?.counterexample).toBe("n=4 fails");
  });

  it("rejects a label outside the allowed set", () => {
    const raw = "LABEL: REFUTES\nREASON: x\nCOUNTEREXAMPLE: None";
    expect(parseEdgeSuggestion(raw, allowed)).toBeNull();
  });

  it("returns null when no LABEL line is present", () => {
    expect(parseEdgeSuggestion("I'm not sure.", allowed)).toBeNull();
  });
});

describe("parseEdgeVerification", () => {
  it("parses valid: true", () => {
    const raw = "VALID: true\nREASON: Holds in general.\nCOUNTEREXAMPLE: None";
    expect(parseEdgeVerification(raw)).toEqual({ valid: true, reason: "Holds in general.", counterexample: null });
  });

  it("parses valid: false with a counterexample", () => {
    const raw = "VALID: false\nREASON: Fails for n=0.\nCOUNTEREXAMPLE: n=0";
    expect(parseEdgeVerification(raw)).toEqual({ valid: false, reason: "Fails for n=0.", counterexample: "n=0" });
  });

  it("returns null when no VALID line is present", () => {
    expect(parseEdgeVerification("unclear")).toBeNull();
  });
});

describe("buildEdgeVerificationPrompt", () => {
  it("embeds the label and both excerpts", () => {
    const prompt = buildEdgeVerificationPrompt("SPECIALIZES", "A", "def A", "B", "def B");
    expect(prompt).toContain("SPECIALIZES");
    expect(prompt).toContain("def A");
    expect(prompt).toContain("def B");
  });
});
