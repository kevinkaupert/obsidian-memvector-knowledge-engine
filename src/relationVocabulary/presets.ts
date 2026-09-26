import { TFile, type App } from "obsidian";
import { ensureParentFolder } from "../ensureFolder";
import type { SettingsHost } from "../settings/types";
import { LAW_VOCABULARY, MEDICINE_VOCABULARY, PHILOSOPHY_VOCABULARY } from "./bundledPresets";
import { DEFAULT_RELATION_VOCABULARY } from "./defaultVocabulary";
import { DEFAULT_RELATION_VOCABULARY_PATH, isValidTerm } from "./loadRelationVocabulary";
import type { RelationTermDef, RelationVocabularyFile } from "./types";

/** Folder holding preset vocabulary files - vault-owned, version-controllable, shareable across vaults (Issue #119). */
export const PRESET_DIR = "wiki/presets";

export interface RelationPreset {
  /** File basename without extension - also the stable preset identifier. */
  key: string;
  /** Human-readable preset name shown in the Settings dropdown. */
  label: string;
  /** Bundled presets ship with the plugin and are (re)written from memory on activation. */
  bundled: boolean;
  /** Vault path of the preset file. */
  path: string;
}

export interface BundledPreset {
  label: string;
  terms: RelationTermDef[];
}

export const BUNDLED_PRESETS: Record<string, BundledPreset> = {
  stem: { label: "STEM (Default)", terms: DEFAULT_RELATION_VOCABULARY },
  law: { label: "Law & Norms", terms: LAW_VOCABULARY },
  medicine: { label: "Medicine", terms: MEDICINE_VOCABULARY },
  philosophy: { label: "Philosophy", terms: PHILOSOPHY_VOCABULARY },
};

/** Sanitizes a user-entered preset name into a stable file key (lowercase, dashes, diacritics stripped). */
export function sanitizePresetKey(name: string): string {
  const ascii = (name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const cleaned = ascii.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "preset";
}

export function presetFilePath(key: string): string {
  return `${PRESET_DIR}/${sanitizePresetKey(key)}.json`;
}

/** Humanizes a preset key for display when no bundled label exists (e.g. "my-domain" -> "My Domain"). */
export function humanizePresetKey(key: string): string {
  const cleaned = sanitizePresetKey(key);
  return cleaned
    .split("-")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

/** Lists bundled presets plus user preset files found in wiki/presets/. */
export async function listPresets(app: App): Promise<RelationPreset[]> {
  const presets: RelationPreset[] = [];
  const seen = new Set<string>();

  for (const [key, bundled] of Object.entries(BUNDLED_PRESETS)) {
    presets.push({ key, label: bundled.label, bundled: true, path: presetFilePath(key) });
    seen.add(key);
  }

  try {
    const listing = await app.vault.adapter.list(PRESET_DIR);
    for (const filePath of (listing.files ?? []).sort()) {
      const base = filePath.split("/").pop() || "";
      if (!base.toLowerCase().endsWith(".json")) continue;
      const key = base.slice(0, -5);
      if (seen.has(key)) continue;
      presets.push({ key, label: humanizePresetKey(key), bundled: false, path: filePath });
      seen.add(key);
    }
  } catch {
    // Folder may not exist yet - bundled presets are still listed.
  }

  return presets;
}

/** Writes the given terms to a vocabulary file, creating parent folders as needed. */
export async function writeVocabularyFile(app: App, path: string, terms: RelationTermDef[]): Promise<void> {
  const content = JSON.stringify({ terms } satisfies RelationVocabularyFile, null, 2);
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) {
    await app.vault.modify(existing, content);
  } else {
    await ensureParentFolder(app, path);
    await app.vault.create(path, content);
  }
}

/**
 * Reads the terms of an existing vocabulary file. Returns an empty array when
 * the file is missing or malformed (caller decides how to fall back).
 */
export async function readVocabularyFile(app: App, path: string): Promise<RelationTermDef[]> {
  const existing = app.vault.getAbstractFileByPath(path);
  if (!(existing instanceof TFile)) return [];
  try {
    const raw = await app.vault.cachedRead(existing);
    const parsed = JSON.parse(raw) as Partial<RelationVocabularyFile>;
    return Array.isArray(parsed.terms) ? parsed.terms.filter(isValidTerm) : [];
  } catch (err) {
    console.warn(`MemVector: could not read vocabulary file ${path}:`, err);
    return [];
  }
}

/**
 * Makes a preset the active vocabulary: bundled presets are (re)written from
 * memory if their file is missing, then settings.relationVocabularyPath points
 * at the preset file. No re-embedding needed - edge labels are stored as
 * strings in SQLite (Issue #119).
 */
export async function activatePreset(app: App, host: SettingsHost, key: string): Promise<void> {
  const bundled = BUNDLED_PRESETS[key];
  const path = presetFilePath(key);

  const existing = app.vault.getAbstractFileByPath(path);
  if (bundled && !(existing instanceof TFile)) {
    await writeVocabularyFile(app, path, bundled.terms);
  } else if (!bundled && !(existing instanceof TFile)) {
    throw new Error(`Preset file not found: ${path}`);
  }

  host.settings.relationVocabularyPath = path;
  await host.saveSettings();
}

/** Creates a new user preset seeded with the active vocabulary's terms and activates it. */
export async function createPreset(app: App, host: SettingsHost, name: string): Promise<RelationPreset> {
  const key = sanitizePresetKey(name);
  const path = presetFilePath(key);
  if (app.vault.getAbstractFileByPath(path) instanceof TFile) {
    throw new Error(`Preset already exists: ${path}`);
  }

  const activePath = (host.settings.relationVocabularyPath || DEFAULT_RELATION_VOCABULARY_PATH).trim() || DEFAULT_RELATION_VOCABULARY_PATH;
  const activeTerms = await readVocabularyFile(app, activePath);
  const terms = activeTerms.length > 0 ? activeTerms : [...DEFAULT_RELATION_VOCABULARY];
  await writeVocabularyFile(app, path, terms);

  host.settings.relationVocabularyPath = path;
  await host.saveSettings();
  return { key, label: name.trim() || humanizePresetKey(key), bundled: false, path };
}

/** Renames a user preset file (and activates the renamed path when it was active). */
export async function renamePreset(app: App, host: SettingsHost, oldKey: string, newName: string): Promise<RelationPreset> {
  if (BUNDLED_PRESETS[oldKey]) throw new Error("Bundled presets cannot be renamed");

  const oldPath = presetFilePath(oldKey);
  const oldFile = app.vault.getAbstractFileByPath(oldPath);
  if (!(oldFile instanceof TFile)) throw new Error(`Preset file not found: ${oldPath}`);

  const newKey = sanitizePresetKey(newName);
  const newPath = presetFilePath(newKey);
  if (newPath !== oldPath && app.vault.getAbstractFileByPath(newPath) instanceof TFile) {
    throw new Error(`Preset already exists: ${newPath}`);
  }
  if (newPath !== oldPath) await app.vault.rename(oldFile, newPath);

  if ((host.settings.relationVocabularyPath || "").trim() === oldPath) {
    host.settings.relationVocabularyPath = newPath;
    await host.saveSettings();
  }
  return { key: newKey, label: newName.trim() || humanizePresetKey(newKey), bundled: false, path: newPath };
}

/** Trashes a user preset file; bundled presets cannot be deleted. */
export async function deletePreset(app: App, host: SettingsHost, key: string): Promise<void> {
  if (BUNDLED_PRESETS[key]) throw new Error("Bundled presets cannot be deleted");

  const path = presetFilePath(key);
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return;

  await app.vault.trash(file, false);

  if ((host.settings.relationVocabularyPath || "").trim() === path) {
    host.settings.relationVocabularyPath = DEFAULT_RELATION_VOCABULARY_PATH;
    await host.saveSettings();
  }
}
