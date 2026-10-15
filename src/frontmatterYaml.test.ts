import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async () => {
  const yaml = await import("yaml");
  return {
    stringifyYaml: (obj: unknown) => yaml.stringify(obj),
    parseYaml: (str: string) => yaml.parse(str),
  };
});

import { serializeFrontmatter, parseFrontmatter } from "./frontmatterYaml";
import { parseYaml } from "obsidian";

describe("serializeFrontmatter & parseFrontmatter (Issue #247)", () => {
  it("wraps serialized fields in a standard frontmatter block", () => {
    const raw = {
      type: "relation",
      title: "Simple Title",
    };
    const serialized = serializeFrontmatter(raw);
    expect(serialized.startsWith("---\n")).toBe(true);
    expect(serialized.endsWith("\n---\n")).toBe(true);

    const parsed = parseFrontmatter(serialized);
    expect(parsed).toEqual(raw);
  });

  it("round-trips titles with \", :, # and line breaks through parseYaml", () => {
    const trickyTitle = 'Satz: "Fundamentalsatz der Algebra" #1: Existenz & Eindeutigkeit\n(zweite Zeile)';
    const trickyDesc = 'Definition mit "Anführungszeichen", Doppelpunkt: hier und #Hashtags\nsowie Zeilenumbruch.';
    const fields = {
      type: "relation",
      title: trickyTitle,
      description: trickyDesc,
      status: "draft",
      sources: ["wiki/Algebra.md", 'wiki/Satz "A".md'],
      generated: {
        by: "MemVector Co-Pilot",
        at: "2026-10-15T12:00:00.000Z",
      },
      verified: null,
      relation_type: "PROVES",
      original_term: 'beweist: "direkt"',
      bidirectional: false,
      source_note: '[[wiki/Algebra|Algebra: "Grundlagen"]]',
      target_note: '[[wiki/Fundamentalsatz|Fundamentalsatz #1]]',
    };

    const serialized = serializeFrontmatter(fields);

    // Ensure the raw YAML block itself can be parsed with parseYaml
    const yamlBody = serialized.replace(/^---\r?\n/, "").replace(/\r?\n---\n?$/, "");
    const parsedDirect = parseYaml(yamlBody);
    expect(parsedDirect).toEqual(fields);

    // And verify through parseFrontmatter
    const parsedFromNote = parseFrontmatter(serialized);
    expect(parsedFromNote).toEqual(fields);
    expect(parsedFromNote?.title).toBe(trickyTitle);
    expect(parsedFromNote?.description).toBe(trickyDesc);
  });

  it("returns null when no frontmatter block is found", () => {
    expect(parseFrontmatter("Nur Notiztext ohne Frontmatter")).toBeNull();
    expect(parseFrontmatter("")).toBeNull();
  });
});
