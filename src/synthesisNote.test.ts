import { describe, expect, it } from "vitest";
import { synthesisBaseName, synthesisFrontmatter } from "./synthesisNote";

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

describe("synthesisBaseName (#277)", () => {
  it("builds one flat name from titles, without folders or percent-encoding", () => {
    const name = synthesisBaseName([
      { title: "Roche-Limit Skizze", path: "Daily Notes/2026-10-03-Inbox/Roche-Limit Skizze.md" },
    ]);
    expect(name).toBe("synthese-roche-limit-skizze");
  });

  it("drops characters invalid in file names and links, including / and %", () => {
    expect(synthesisBaseName([{ title: "A/B: 50%", path: "x/A.md" }, { title: "[[C]]#d", path: "C.md" }]))
      .toBe("synthese-a-b-50-c-d");
  });

  it("falls back to the basename without a title and caps the length at 50", () => {
    expect(synthesisBaseName([{ title: "", path: "Daily Notes/Roche Limit.md" }])).toBe("synthese-roche-limit");
    const long = synthesisBaseName([{ title: "x".repeat(80), path: "a.md" }]);
    expect(long).toBe(`synthese-${"x".repeat(50)}`);
    expect(synthesisBaseName([{ title: "///", path: "a/.md" }])).toBe("synthese-notiz");
  });
});
