/**
 * Vault basename/link-target -> slug (umlaut folding, etc). This exact
 * algorithm was duplicated inline 5+ times across the original bundle
 * (Memgraph sync, the sidebar's node-position hash, the synthesis view's
 * vault-title map and its two link-fixup branches) - single copy here.
 */
export function toSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Canonical, collision-free note identity for graph/vector storage and
 * retrieval: the slugged vault-relative path without its extension. Unlike
 * a basename-only slug, this stays unique across same-basename notes in
 * different folders (e.g. "Work/Overview.md" vs "Home/Overview.md").
 * Never use this as literal WikiLink text - see wikiLinkTarget for that.
 */
export function pathToId(path: string): string {
  return toSlug(path.replace(/\.md$/i, ""));
}

/**
 * The vault path with its extension stripped, suitable as the literal target
 * of a `[[...]]` WikiLink written into a note (unlike pathToId's slug, which
 * Obsidian cannot resolve back to a file).
 */
export function wikiLinkTarget(path: string): string {
  return path.replace(/\.md$/i, "");
}
