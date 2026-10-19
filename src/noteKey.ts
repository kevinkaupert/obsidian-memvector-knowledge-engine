/**
 * Purpose: Resolves the key MemVector stores a note under (ADR-0007, #271): the note's frontmatter `id` when it is a
 * valid ULID and unique in the vault, otherwise the path key `pathToId(path)`.
 * Architecture: ULID keys are uppercased and path keys are lowercased, so the two key spaces never overlap. Uniqueness
 * needs the whole vault, so keys come from an index over all Markdown files. Without `enableNoteKeyCache` every lookup
 * builds a fresh index (tests, one-off calls). The plugin enables the cache and invalidates it on vault and metadata
 * events, so a scan over n notes reads the frontmatter of each note once. MemVector never writes `id` here.
 */

import type { App, TFile } from "obsidian";
import { pathToId } from "./noteSlug";

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

/** Whether `value` is a ULID (26 characters of Crockford Base32, any case). */
export function isUlid(value: unknown): value is string {
  return typeof value === "string" && ULID.test(value);
}

export interface NoteKeyIndex {
  /** Key of the note at `path`; the path key for a path that is not a note in the vault (old or deleted path). */
  keyOf(path: string): string;
  /** Ids used by more than one note, with their paths in key order (the first keeps the id). */
  duplicates: Array<{ id: string; paths: string[] }>;
  /** Whether the metadata cache had parsed the note, so its key reflects its frontmatter. */
  isKnown(path: string): boolean;
  /** Whether the note at `path` has `key` as its frontmatter id, also when a duplicate keeps the key. */
  carriesId(path: string, key: string): boolean;
}

/** Builds the key index from the metadata cache; the note whose path sorts first keeps a duplicated id. */
export function buildNoteKeyIndex(app: App): NoteKeyIndex {
  const files: TFile[] = app.vault?.getMarkdownFiles?.() ?? [];
  const byId = new Map<string, string[]>();
  const known = new Set<string>();
  const idAt = new Map<string, string>();
  for (const file of files) {
    const fileCache = app.metadataCache?.getFileCache(file);
    if (fileCache) known.add(file.path);
    const id: unknown = fileCache?.frontmatter?.id;
    if (!isUlid(id)) continue;
    const key = id.toUpperCase();
    idAt.set(file.path, key);
    const paths = byId.get(key);
    if (paths) paths.push(file.path);
    else byId.set(key, [file.path]);
  }
  const keys = new Map<string, string>();
  const duplicates: NoteKeyIndex["duplicates"] = [];
  for (const [id, paths] of byId) {
    paths.sort((a, b) => a.localeCompare(b, "en"));
    keys.set(paths[0], id);
    if (paths.length > 1) duplicates.push({ id, paths });
  }
  return { keyOf: (path) => keys.get(path) ?? pathToId(path), duplicates, isKnown: (path) => known.has(path), carriesId: (path, key) => idAt.get(path) === key };
}

const cache = new WeakMap<App, { index: NoteKeyIndex | null; previous: NoteKeyIndex | null }>();
const reported = new WeakMap<App, Set<string>>();

/** Keeps one key index per app until `invalidateNoteKeys` is called (the plugin calls it on vault and metadata events). */
export function enableNoteKeyCache(app: App): void {
  cache.set(app, { index: null, previous: null });
}

export function invalidateNoteKeys(app: App): void {
  const entry = cache.get(app);
  if (!entry) return;
  if (entry.index) entry.previous = entry.index;
  entry.index = null;
}

/**
 * Paths whose key can change without an event of their own: every note of a duplicated id, now or before the last
 * invalidation (deleting or renaming the owner hands the id to the next note).
 */
export function duplicateIdPaths(app: App): string[] {
  const entry = cache.get(app);
  const indexes = [entry?.previous, noteKeys(app)].filter((i): i is NoteKeyIndex => Boolean(i));
  return [...new Set(indexes.flatMap((i) => i.duplicates.flatMap((d) => d.paths)))];
}

/**
 * Paths that owned a duplicated id at the last invalidation and lost it since (#279): another note with the same id
 * now sorts first, e.g. after a rename. Their rows must move to the path key before the new owner's rows take the id.
 */
export function lostDuplicateIdPaths(app: App): string[] {
  const previous = cache.get(app)?.previous;
  if (!previous) return [];
  const current = noteKeys(app);
  return previous.duplicates
    .map((d) => d.paths[0])
    .filter((path) => current.isKnown(path) && current.keyOf(path) !== previous.keyOf(path));
}

/** The current key index of `app`; duplicated ids are reported once per index build. */
export function noteKeys(app: App): NoteKeyIndex {
  const entry = cache.get(app);
  if (entry?.index) return entry.index;
  const index = buildNoteKeyIndex(app);
  if (entry) {
    entry.index = index;
    reportDuplicates(app, index);
  }
  return index;
}

/** Key of the note at `path` (ADR-0007). */
export function noteKey(app: App, path: string): string {
  return noteKeys(app).keyOf(path);
}

function reportDuplicates(app: App, index: NoteKeyIndex): void {
  const seen = reported.get(app) ?? new Set<string>();
  reported.set(app, seen);
  for (const { id, paths } of index.duplicates) {
    const signature = `${id}|${paths.join("|")}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    console.warn(`MemVector: frontmatter id ${id} is used by ${paths.length} notes; ${paths[0]} keeps it, the others are keyed by path:`, paths.slice(1));
  }
}
