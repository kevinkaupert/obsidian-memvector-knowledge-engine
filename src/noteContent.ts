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

/**
 * Truncates `text` to `capChars`, or returns it unchanged when `capChars` is
 * 0/negative (the user-facing convention for "no cap" - see
 * settings.synthesisContentCapChars). Simple prefix truncation is a known,
 * documented limitation (whatever's past the cap is silently dropped,
 * wherever it falls in the note) - a smarter, context-aware allocation is a
 * possible future improvement, not attempted here.
 */
export function capText(text: string, capChars: number): string {
  return capChars > 0 ? text.slice(0, capChars) : text;
}
