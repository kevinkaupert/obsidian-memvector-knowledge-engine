import { describe, expect, it } from "vitest";
import { stripFrontmatter } from "./noteContent";

describe("stripFrontmatter", () => {
  it("removes a leading YAML frontmatter block", () => {
    const content = "---\ntype: theorem\ntitle: Foo\n---\n\n# Foo\nActual body text.";
    expect(stripFrontmatter(content)).toBe("\n# Foo\nActual body text.");
  });

  it("removes a large frontmatter block that would otherwise dominate a truncation window (regression: gauss-summenformel <-> beweistricks similarity)", () => {
    const longSources = Array.from({ length: 20 }, (_, i) => `  - /wiki/sources/note-${i}.md`).join("\n");
    const content = `---\ntype: synthesis\nsources:\n${longSources}\n---\n\nDie eigentliche Notiz beginnt hier.`;
    const stripped = stripFrontmatter(content);
    expect(stripped.slice(0, 50)).toContain("Die eigentliche Notiz beginnt hier");
  });

  it("leaves content without frontmatter untouched", () => {
    const content = "# Just a heading\nNo frontmatter here.";
    expect(stripFrontmatter(content)).toBe(content);
  });

  it("does not strip a `---` that appears mid-document (not at the very start)", () => {
    const content = "# Heading\n\n---\n\nMore content after a horizontal rule.";
    expect(stripFrontmatter(content)).toBe(content);
  });
});
