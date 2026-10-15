import type { App } from "obsidian";
import { isRelationNote } from "./relationNotes";
import { shouldIncludeFile } from "./vaultFilter";
import type { RelationEdge } from "./views/vectorScatter/types";
import { DEFAULT_RELATIONS_FOLDER } from "./vaultLayout";

export const SUGGESTED_SUFFIX = "_suggested";

export interface LinkKey {
  label: string;
  confidence: "confirmed" | "suggested";
}

/**
 * Purpose: Maps frontmatter keys to relation labels: every vocabulary label in lowercase (`requires`, `equivalent_to`)
 * is a confirmed typed-link key, and `<label>_suggested` its unconfirmed form (#243).
 */
export function buildLinkKeys(labels: Iterable<string>): Map<string, LinkKey> {
  const keys = new Map<string, LinkKey>();
  for (const raw of labels) {
    const label = raw.trim().toUpperCase();
    if (!label) continue;
    const key = label.toLowerCase();
    keys.set(key, { label, confidence: "confirmed" });
    keys.set(`${key}${SUGGESTED_SUFFIX}`, { label, confidence: "suggested" });
  }
  return keys;
}

/** Purpose: Tells whether a frontmatter object carries at least one typed-link key. */
export function hasLinkKeys(frontmatter: Record<string, unknown> | undefined | null, keys: Map<string, LinkKey>): boolean {
  if (!frontmatter) return false;
  return Object.keys(frontmatter).some((k) => keys.has(k.toLowerCase()));
}

/** Purpose: Turns a frontmatter value (one link or a list) into bare link texts: `"[[Körper|K]]"` -> `Körper`. */
export function linkTextsOf(value: unknown): string[] {
  const items = Array.isArray(value) ? value : [value];
  const texts: string[] = [];
  for (const item of items) {
    if (typeof item !== "string") continue;
    const text = item.trim().replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].split("#")[0].trim();
    if (text) texts.push(text);
  }
  return texts;
}

/**
 * Purpose: Reads typed-link edges from the frontmatter of every non-relation note (#243).
 * Architecture: Reads only Obsidian's metadata cache, so it never fails part-way the way relation-note reads can.
 * Relation notes are skipped: their endpoints come from `source_note`/`target_note`. `resolveId` returns null for an
 * excluded target, which drops the edge like an excluded relation-note endpoint.
 */
export function loadFrontmatterLinkEdges(
  app: App,
  keys: Map<string, LinkKey>,
  resolveId: (linkText: string, sourcePath: string) => string | null,
  toId: (path: string) => string,
  exclusions = "",
  relationsFolder = DEFAULT_RELATIONS_FOLDER
): RelationEdge[] {
  if (keys.size === 0) return [];
  const edges: RelationEdge[] = [];
  const files = app.vault.getMarkdownFiles().slice().sort((a, b) => a.path.localeCompare(b.path, "en"));
  for (const f of files) {
    const fm: Record<string, unknown> | undefined = app.metadataCache.getFileCache(f)?.frontmatter;
    if (!hasLinkKeys(fm, keys) || !fm) continue;
    if (isRelationNote(f.path, fm.type, relationsFolder)) continue;
    if (!shouldIncludeFile(f, exclusions)) continue;
    const srcId = toId(f.path);
    for (const [rawKey, value] of Object.entries(fm)) {
      const key = keys.get(rawKey.toLowerCase());
      if (!key) continue;
      for (const linkText of linkTextsOf(value)) {
        const tgtId = resolveId(linkText, f.path);
        if (!tgtId || tgtId === srcId) continue;
        edges.push({
          srcId,
          tgtId,
          relType: key.label,
          desc: "",
          title: `${srcId} -> ${tgtId}`,
          path: f.path,
          bidirectional: false,
          origin: "frontmatter",
          confidence: key.confidence,
        });
      }
    }
  }
  return edges;
}

/** Purpose: Edges that count as established knowledge: everything except unconfirmed `<label>_suggested` links. */
export function confirmedEdges(edges: RelationEdge[]): RelationEdge[] {
  return edges.filter((e) => e.confidence !== "suggested");
}
