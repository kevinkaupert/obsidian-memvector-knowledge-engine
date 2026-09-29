import { TFile, type App } from "obsidian";
import { ensureParentFolder } from "../ensureFolder";
import { DEFAULT_RELATION_VOCABULARY } from "./defaultVocabulary";
import { DEFAULT_RELATION_VOCABULARY_PATH } from "./loadRelationVocabulary";
import type { RelationVocabularyFile } from "./types";
import { createVocabularyMutator } from "./vocabularyMutations";

/** Category under which free-text types entered in the Relation Builder are auto-persisted (Issue #119). */
export const CUSTOM_CATEGORY = "Custom";

export interface CustomTypeInput {
  /** Sanitized canonical Cypher label (e.g. "IS_HOMOMORPHIC_TO"). */
  label: string;
  /** Raw display term the user typed, kept as the dropdown text. */
  term: string;
  bidirectional: boolean;
}

/**
 * Purpose: Appends relation types entered as free text in the Relation Builder to the active
 * vocabulary file using atomic Vault.process via createVocabularyMutator (Issues #119, #149).
 * Architecture: Non-fatal by design - a failed persistence (read-only vault, malformed file)
 * logs a warning and returns false instead of breaking the relation save that already succeeded.
 * Deliberately empty vocabularies ({ terms: [] }) are preserved without reseeding STEM.
 */
export async function persistCustomRelationTypes(
  app: App,
  settings: { relationVocabularyPath?: string } | undefined,
  customTypes: CustomTypeInput[]
): Promise<boolean> {
  if (customTypes.length === 0) return true;

  const path = ((settings?.relationVocabularyPath || DEFAULT_RELATION_VOCABULARY_PATH).trim()) || DEFAULT_RELATION_VOCABULARY_PATH;

  const existing = app.vault.getAbstractFileByPath(path);
  if (!(existing instanceof TFile)) {
    try {
      await ensureParentFolder(app, path);
      const seed: RelationVocabularyFile = { terms: DEFAULT_RELATION_VOCABULARY };
      await app.vault.create(path, JSON.stringify(seed, null, 2));
    } catch {
      // Vault may already have the file (race) or be read-only - check if file now exists
      if (!(app.vault.getAbstractFileByPath(path) instanceof TFile)) {
        console.warn(`MemVector: failed to create vocabulary file at ${path}`);
        return false;
      }
    }
  }

  const mutator = createVocabularyMutator(app, () => path);
  const outcome = await mutator.mutate((current) => {
    const knownLabels = new Set(current.map((t) => t.label.toUpperCase()));
    const knownKeys = new Set(current.map((t) => t.key));

    const nextTerms = [...current];
    let appended = 0;

    for (const custom of customTypes) {
      const label = (custom.label || "").trim().toUpperCase();
      if (!label || knownLabels.has(label)) continue;

      let key = `custom${label}`;
      let suffix = 2;
      while (knownKeys.has(key)) key = `custom${label}_${suffix++}`;

      nextTerms.push({
        key,
        label,
        term: custom.term || label,
        category: CUSTOM_CATEGORY,
        bidirectional: custom.bidirectional,
        reversed: false,
      });
      knownLabels.add(label);
      knownKeys.add(key);
      appended++;
    }

    if (appended === 0) return null;
    return nextTerms;
  });

  if (outcome.result === "written" || outcome.result === "skipped") {
    return true;
  }
  if (outcome.result === "read-failed") {
    console.warn(`MemVector: could not parse ${path}, aborting persistCustomRelationTypes`);
    return false;
  }
  if (outcome.result === "write-failed") {
    console.warn("MemVector: failed to persist custom relation type to vocabulary:", outcome.error);
    return false;
  }
  return false;
}
