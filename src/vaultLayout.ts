import type { MemVectorSettings } from "./settings/types";

/** Default folder for relation notes written by the relation builder. */
export const DEFAULT_RELATIONS_FOLDER = "wiki/relations";
/** Default folder for saved synthesis notes. */
export const DEFAULT_SYNTHESIS_FOLDER = "wiki/synthesis";
/** Default folder for user relation-vocabulary presets. */
export const DEFAULT_PRESETS_FOLDER = "wiki/presets";
/** Default path of the active relation vocabulary file. */
export const DEFAULT_RELATION_VOCABULARY_PATH = "wiki/relation-types.json";

/**
 * Purpose: Normalizes a user-entered vault folder (trimmed, no leading/trailing slashes), falling back when empty.
 * Architecture: Every plugin-owned path is resolved in this module from settings, so no other code builds a folder
 * path on its own and a vault is never forced into a `wiki/` layout.
 */
export function normalizeFolder(value: string | undefined, fallback: string): string {
  const folder = (value ?? "").trim().replace(/^\/+|\/+$/g, "");
  return folder || fallback;
}

/** Purpose: Folder the relation builder writes to, and the fallback criterion for relation notes (ADR-0004). */
export function relationsFolder(settings: Partial<Pick<MemVectorSettings, "relationsFolder">>): string {
  return normalizeFolder(settings.relationsFolder, DEFAULT_RELATIONS_FOLDER);
}

/** Purpose: Folder saved synthesis notes are written to. */
export function synthesisFolder(settings: Partial<Pick<MemVectorSettings, "synthesisFolder">>): string {
  return normalizeFolder(settings.synthesisFolder, DEFAULT_SYNTHESIS_FOLDER);
}

/** Purpose: Folder user relation-vocabulary presets are listed from and written to. */
export function presetsFolder(settings: Partial<Pick<MemVectorSettings, "presetsFolder">>): string {
  return normalizeFolder(settings.presetsFolder, DEFAULT_PRESETS_FOLDER);
}

/** Purpose: First free `<folder>/<baseName>.md`, appending `-1`, `-2`, ... while `exists` reports a taken path. */
export function uniqueNotePath(folder: string, baseName: string, exists: (path: string) => boolean): string {
  let path = `${folder}/${baseName}.md`;
  for (let counter = 1; exists(path); counter++) path = `${folder}/${baseName}-${counter}.md`;
  return path;
}

/** Purpose: Resolves the active vocabulary file path from settings, falling back to the default for an empty value. */
export function resolveVocabularyPath(settings: Partial<Pick<MemVectorSettings, "relationVocabularyPath">>): string {
  return (settings.relationVocabularyPath || DEFAULT_RELATION_VOCABULARY_PATH).trim() || DEFAULT_RELATION_VOCABULARY_PATH;
}
