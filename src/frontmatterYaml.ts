import { stringifyYaml, parseYaml } from "obsidian";

/**
 * Purpose: Unified frontmatter serialization and parsing helper for synthesis and relation notes (#247).
 * Architecture: Serializes frontmatter using Obsidian's stringifyYaml so titles and descriptions
 * containing quotes, colons, hash symbols, or line breaks remain valid YAML.
 */

/**
 * Serializes a frontmatter record into a standard YAML frontmatter block delimited by `---`.
 */
export function serializeFrontmatter(fields: Record<string, unknown>): string {
  const yaml = stringifyYaml(fields).trim();
  return `---\n${yaml}\n---\n`;
}

/**
 * Parses the frontmatter of a markdown file into an object, or returns null if no frontmatter is found.
 */
export function parseFrontmatter(fileContent: string): Record<string, unknown> | null {
  const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  try {
    return (parseYaml(match[1]) || {}) as Record<string, unknown>;
  } catch {
    return null;
  }
}
