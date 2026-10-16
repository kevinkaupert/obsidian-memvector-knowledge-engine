import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async () => {
  const yaml = await import("yaml");
  return { parseYaml: (str: string) => yaml.parse(str), stringifyYaml: (obj: unknown) => yaml.stringify(obj) };
});

import { buildEmbeddingInput, parseEmbeddingFrontmatterKeys } from "./embeddingText";

describe("buildEmbeddingInput", () => {
  it("prefixes the basename and strips frontmatter", () => {
    const input = buildEmbeddingInput("Note", "---\ntitle: Other\n---\nBody text", 100);
    expect(input.text).toBe("Note\nBody text");
    expect(input.body).toBe("Body text");
  });

  it("caps the text at maxChars and hashes the capped text", () => {
    const long = "x".repeat(5000);
    const capped = buildEmbeddingInput("Note", long, 1000);
    expect(capped.text.length).toBe(1000);
    expect(capped.hash).toBe(buildEmbeddingInput("Note", `${long}yyy`, 1000).hash);
  });

  it("treats 0 as no cap", () => {
    const long = "x".repeat(20000);
    expect(buildEmbeddingInput("Note", long, 0).text.length).toBe("Note\n".length + 20000);
  });

  it("changes the hash when a larger cap exposes more text", () => {
    const long = "a".repeat(3000) + "b".repeat(3000);
    expect(buildEmbeddingInput("Note", long, 2000).hash).not.toBe(buildEmbeddingInput("Note", long, 8000).hash);
  });

  it("keeps the hash when the cap changes but the note fits under both caps", () => {
    expect(buildEmbeddingInput("Note", "short", 2000).hash).toBe(buildEmbeddingInput("Note", "short", 8000).hash);
  });

  it("changes the hash when the body changes", () => {
    expect(buildEmbeddingInput("Note", "one", 8000).hash).not.toBe(buildEmbeddingInput("Note", "two", 8000).hash);
  });
});

describe("frontmatter fields in the embedding text (#251)", () => {
  const note = "---\ndescription: A set with two operations\naliases: [Koerper, Field]\nnotation: K\nother: ignored\n---\nBody";
  const keys = ["description", "aliases", "notation"];

  it("is byte-identical to the pre-#251 text without keys, so stored hashes stay cache hits", () => {
    const before = buildEmbeddingInput("Field", note, 8000);
    expect(before.text).toBe("Field\nBody");
    expect(buildEmbeddingInput("Field", note, 8000, []).hash).toBe(before.hash);
  });

  it("prepends the configured keys in the configured order after the basename", () => {
    expect(buildEmbeddingInput("Field", note, 8000, keys).text).toBe(
      "Field\ndescription: A set with two operations\naliases: Koerper, Field\nnotation: K\nBody"
    );
    expect(buildEmbeddingInput("Field", note, 8000, ["notation", "description"]).text).toBe(
      "Field\nnotation: K\ndescription: A set with two operations\nBody"
    );
  });

  it("keeps the hash of a note without any configured field, so enabling the setting does not re-embed it", () => {
    const plain = "---\ntags: [x]\n---\nBody";
    expect(buildEmbeddingInput("N", plain, 8000, keys).hash).toBe(buildEmbeddingInput("N", plain, 8000).hash);
    expect(buildEmbeddingInput("N", "Body without frontmatter", 8000, keys).hash).toBe(
      buildEmbeddingInput("N", "Body without frontmatter", 8000).hash
    );
  });

  it("changes the hash only when a configured field changes", () => {
    const base = buildEmbeddingInput("Field", note, 8000, keys).hash;
    expect(buildEmbeddingInput("Field", note.replace("notation: K", "notation: F"), 8000, keys).hash).not.toBe(base);
    expect(buildEmbeddingInput("Field", note.replace("other: ignored", "other: changed"), 8000, keys).hash).toBe(base);
  });

  it("skips empty and nested values and keeps the body unaffected", () => {
    const odd = "---\ndescription: \"\"\nnotation: { latex: K }\naliases: []\n---\nBody";
    const input = buildEmbeddingInput("N", odd, 8000, keys);
    expect(input.text).toBe("N\nBody");
    expect(input.body).toBe("Body");
  });

  it("parses the comma-separated setting, dropping blanks and duplicates", () => {
    expect(parseEmbeddingFrontmatterKeys(" description, aliases,,description , notation ")).toEqual(["description", "aliases", "notation"]);
    expect(parseEmbeddingFrontmatterKeys("")).toEqual([]);
    expect(parseEmbeddingFrontmatterKeys(undefined)).toEqual([]);
  });
});
