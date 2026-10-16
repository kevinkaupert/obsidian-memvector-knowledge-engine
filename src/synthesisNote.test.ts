import { describe, expect, it } from "vitest";
import { synthesisFrontmatter } from "./synthesisNote";

describe("synthesisFrontmatter (knowOS vault schema, #248)", () => {
  const nodes = [
    { id: "a", title: "A", path: "wiki/A.md" },
    { id: "b", title: "Basis", path: "wiki/sub/B.md" },
  ];

  it("writes sources as wikilinks, generated.by with provider and model, and a ULID id", () => {
    const fm = synthesisFrontmatter(nodes, "Synthesis: A & Basis", "desc", "openai", "gpt-4o", new Date("2026-10-16T10:00:00Z"));
    expect(fm.sources).toEqual(["[[wiki/A|A]]", "[[wiki/sub/B|Basis]]"]);
    expect(fm.generated).toEqual({ by: "memvector/openai:gpt-4o", at: "2026-10-16T10:00:00.000Z" });
    expect(fm.type).toBe("synthesis");
    expect(fm.status).toBe("draft");
    expect(fm.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});
