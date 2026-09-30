import { describe, expect, it } from "vitest";
import { buildEmbeddingInput } from "./embeddingText";

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
