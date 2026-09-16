/**
 * Purpose: Converts raw vault basename or link-target strings to safe URL/file slugs with German umlaut folding.
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
 * Purpose: Derives a canonical, collision-free, injective note identity for graph and vector storage.
 * Architecture: Preserves folder hierarchy with '/' and distinguishes spaces and punctuation from hyphens
 * to ensure that distinct vault paths (e.g. Work/Overview.md, Work-Overview.md, Work Overview.md) never collide (F04b).
 */
export function pathToId(path: string): string {
  const noExt = path.replace(/\.md$/i, "");
  const segments = noExt.split("/");
  return segments
    .map((seg) => {
      const folded = seg
        .toLowerCase()
        .replace(/ä/g, "ae")
        .replace(/ö/g, "oe")
        .replace(/ü/g, "ue")
        .replace(/ß/g, "ss");
      return encodeURIComponent(folded);
    })
    .join("/");
}

/**
 * Purpose: Returns the vault path with its extension stripped, suitable as a literal [[...]] WikiLink target.
 */
export function wikiLinkTarget(path: string): string {
  return path.replace(/\.md$/i, "");
}
