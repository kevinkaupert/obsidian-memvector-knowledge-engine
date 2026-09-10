/**
 * Strips a leading YAML frontmatter block. Several call sites truncate note
 * content to a fixed character window before computing similarity/hashes -
 * without this, a note with a long `sources:`/`tags:` list can have its
 * entire truncation window consumed by frontmatter, leaving zero actual
 * body content for the similarity calc to compare against.
 */
export function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}
