import { Notice, TFile, type App } from "obsidian";
import { DEFAULT_RELATION_VOCABULARY } from "./defaultVocabulary";
import type { CanvasSlot, RelationTermDef } from "./types";

/**
 * Purpose: MemVector's part of the knowOS relation-vocabulary contract (knowOS ADR-0011,
 * docs/contracts/relation-vocabulary.md): writing files without losing fields, the shared pointer file
 * `knowos.json`, and the one-time migration of vocabulary files made before the contract.
 * Architecture: Canvas Tutor reads the same files; neither plugin calls the other. Everything here is plain file
 * handling through the vault API; the pure functions are exported for tests.
 */

export const KNOWOS_FILE = "knowos.json";
export const KNOWOS_VOCABULARY_KEY = "relation_vocabulary";
export const VOCABULARY_SCHEMA = 1;
export const BACKUP_SUFFIX = ".pre-schema1.json";

const DEFAULT_SLOTS: Map<string, CanvasSlot> = new Map(
  DEFAULT_RELATION_VOCABULARY.filter((t) => t.canvas).map((t) => [t.label, t.canvas as CanvasSlot])
);

/**
 * Purpose: The JSON text of a vocabulary file with new terms, keeping every other top-level field of the previous
 * file (`schema`, `name`, anything later) and the entries the reader could not use (contract section 5).
 */
export function serializeVocabulary(previous: unknown, terms: RelationTermDef[], keptInvalid: unknown[] = []): string {
  const base = previous && typeof previous === "object" && !Array.isArray(previous) ? (previous as Record<string, unknown>) : {};
  return JSON.stringify({ ...base, terms: [...terms, ...keptInvalid] }, null, 2);
}

/** The vault-relative preset path named in a `knowos.json` text, or null when it names none. */
export function vocabularyPathFromKnowos(raw: string): string | null {
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const value = (data as Record<string, unknown>)[KNOWOS_VOCABULARY_KEY];
    return typeof value === "string" && value.trim() ? value.trim().replace(/^\/+/, "") : null;
  } catch {
    return null;
  }
}

/** The active preset named by `knowos.json`, when the file exists and names a preset file that exists. */
export async function activeVocabularyFromKnowos(app: App): Promise<string | null> {
  const file = app.vault.getAbstractFileByPath(KNOWOS_FILE);
  if (!(file instanceof TFile)) return null;
  const path = vocabularyPathFromKnowos(await app.vault.cachedRead(file));
  return path && app.vault.getAbstractFileByPath(path) instanceof TFile ? path : null;
}

/**
 * Purpose: Records the active preset in `knowos.json` after the user switched it, so Canvas Tutor follows.
 * Architecture: Changes only `relation_vocabulary` and keeps every other key. A `knowos.json` that is not a JSON
 * object is left untouched and reported, never overwritten.
 */
export async function writeKnowosVocabulary(app: App, path: string): Promise<void> {
  const file = app.vault.getAbstractFileByPath(KNOWOS_FILE);
  if (!(file instanceof TFile)) {
    await app.vault.create(KNOWOS_FILE, JSON.stringify({ [KNOWOS_VOCABULARY_KEY]: path }, null, 2) + "\n");
    return;
  }
  let unreadable = false;
  await app.vault.process(file, (raw) => {
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      unreadable = true;
      return raw;
    }
    return JSON.stringify({ ...(data as Record<string, unknown>), [KNOWOS_VOCABULARY_KEY]: path }, null, 2) + "\n";
  });
  if (unreadable) throw new Error(`${KNOWOS_FILE} is not a JSON object; the active preset was not recorded there`);
}

export interface VocabularyMigration {
  data: Record<string, unknown>;
  /** Labels whose default term was added. */
  added: string[];
  /** Labels that got their default canvas slot. */
  slotted: string[];
}

/**
 * Purpose: The migrated content of a vocabulary file made before the contract (contract section 8), or null when
 * the file must stay as it is.
 * Architecture: Only a file without `schema` and without any `canvas` field that contains at least one default
 * label is migrated. The six default labels that are missing are added; present ones get their default slot unless
 * the file already uses that slot. Nothing is removed, reordered or renamed.
 */
export function migrateVocabulary(data: unknown): VocabularyMigration | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const file = data as Record<string, unknown>;
  const terms = file.terms;
  if ("schema" in file || !Array.isArray(terms)) return null;
  const objects = terms.filter((t): t is Record<string, unknown> => !!t && typeof t === "object" && !Array.isArray(t));
  if (objects.some((t) => "canvas" in t)) return null;
  const labels = new Set(objects.map((t) => (typeof t.label === "string" ? t.label.toUpperCase() : "")));
  if (![...DEFAULT_SLOTS.keys()].some((label) => labels.has(label))) return null;

  const usedSlots = new Set<string>();
  const slotted: string[] = [];
  const nextTerms = (terms as unknown[]).map((t: unknown): unknown => {
    if (!t || typeof t !== "object" || Array.isArray(t)) return t;
    const term = t as Record<string, unknown>;
    const slot = typeof term.label === "string" ? DEFAULT_SLOTS.get(term.label.toUpperCase()) : undefined;
    if (!slot || usedSlots.has(slot.slot) || term.deprecated === true) return t;
    usedSlots.add(slot.slot);
    slotted.push(term.label as string);
    return { ...term, canvas: { ...slot } };
  });
  const added: string[] = [];
  for (const def of DEFAULT_RELATION_VOCABULARY) {
    if (!def.canvas || labels.has(def.label)) continue;
    const slotFree = !usedSlots.has(def.canvas.slot);
    if (slotFree) usedSlots.add(def.canvas.slot);
    const { canvas, ...rest } = def;
    nextTerms.push(slotFree ? { ...rest, canvas: { ...canvas } } : rest);
    added.push(def.label);
  }
  return { data: { ...file, schema: VOCABULARY_SCHEMA, terms: nextTerms }, added, slotted };
}

/** `wiki/relation-types.json` -> `wiki/relation-types.pre-schema1.json` */
export function backupPath(path: string): string {
  return path.replace(/\.json$/i, "") + BACKUP_SUFFIX;
}

/**
 * Purpose: Migrates the active vocabulary file once, with a backup and one notice (contract section 8).
 * Architecture: The backup is written before the file is changed; an existing backup stops the migration, so a
 * restored file is never overwritten. Returns what was done, for tests and logs.
 */
export async function migrateActiveVocabulary(
  app: App,
  path: string,
  notify: (message: string) => void = (m) => new Notice(m, 12000)
): Promise<"migrated" | "unchanged" | "backup-exists"> {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return "unchanged";
  const raw = await app.vault.read(file);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return "unchanged";
  }
  const migration = migrateVocabulary(parsed);
  if (!migration) return "unchanged";
  const backup = backupPath(path);
  if (app.vault.getAbstractFileByPath(backup)) {
    notify(`MemVector: ${path} was not updated for Canvas Tutor, because ${backup} already exists. Remove or rename it to allow the update.`);
    return "backup-exists";
  }
  await app.vault.create(backup, raw);
  await app.vault.modify(file, JSON.stringify(migration.data, null, 2));
  const parts = [
    migration.added.length > 0 ? `added ${migration.added.join(", ")}` : "",
    migration.slotted.length > 0 ? `canvas slots for ${migration.slotted.join(", ")}` : "",
  ].filter(Boolean);
  notify(`MemVector: ${path} updated for Canvas Tutor (${parts.join("; ")}). The previous version is in ${backup}.`);
  return "migrated";
}
