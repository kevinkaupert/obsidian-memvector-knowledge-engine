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
