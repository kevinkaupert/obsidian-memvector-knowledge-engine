/** Folder the relation builder writes new relation notes to. */
export const DEFAULT_RELATIONS_FOLDER = "wiki/relations";

/**
 * Purpose: Tells whether a vault path lies inside `folder` (or is the folder itself), by path prefix.
 * Architecture: A prefix match, not a substring match - `Customers/relations/` must not count as the relations
 * folder, and `wiki/relationships/` must not count as `wiki/relations/`.
 */
export function isInFolder(path: string, folder: string): boolean {
  const normalized = folder.replace(/^\/+|\/+$/g, "");
  if (!normalized) return false;
  return path === normalized || path.startsWith(`${normalized}/`);
}

/**
 * Purpose: The single rule for what counts as a relation note: frontmatter `type: relation`, or a note inside the
 * relations folder.
 * Architecture: Frontmatter comes first because the relation builder writes it into every note and it survives
 * moving or renaming the folder; the folder is the fallback for hand-written relation notes without the type. Every
 * caller (edge loading and graph index, scatter nodes, vault watcher, radar) goes through here so they cannot
 * disagree - see docs/adr/0004-relation-note-identification.md.
 */
export function isRelationNote(path: string, frontmatterType?: unknown, relationsFolder: string = DEFAULT_RELATIONS_FOLDER): boolean {
  if (typeof frontmatterType === "string" && frontmatterType.trim().toLowerCase() === "relation") return true;
  return isInFolder(path, relationsFolder);
}

/** Purpose: Reads the `type` value of a note's leading YAML frontmatter from raw content, for callers without metadata-cache access. */
export function frontmatterTypeOf(content: string): string | undefined {
  const block = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const type = block?.[1].match(/^type:\s*(.+)$/m)?.[1];
  return type?.trim().replace(/^['"]|['"]$/g, "");
}
