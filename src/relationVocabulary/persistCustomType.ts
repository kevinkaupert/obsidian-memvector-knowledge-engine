import { TFile, type App } from "obsidian";
import { ensureParentFolder } from "../ensureFolder";
import { DEFAULT_RELATION_VOCABULARY } from "./defaultVocabulary";
import { DEFAULT_RELATION_VOCABULARY_PATH, isValidTerm } from "./loadRelationVocabulary";
import type { RelationTermDef, RelationVocabularyFile } from "./types";

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
 * vocabulary file so they reappear in the dropdown on the next modal open - no manual JSON
 * editing required (Issue #119). First-class citizens: same sanitized Cypher label format,
 * default layout weight 1.0 (field omitted), same graph traversal behavior.
 * Architecture: Non-fatal by design - a failed persistence (read-only vault, malformed file)
 * logs a warning and returns false instead of breaking the relation save that already succeeded.
 */
export async function persistCustomRelationTypes(
  app: App,
  settings: { relationVocabularyPath?: string } | undefined,
  customTypes: CustomTypeInput[]
): Promise<boolean> {
  if (customTypes.length === 0) return true;

  const path = ((settings?.relationVocabularyPath || DEFAULT_RELATION_VOCABULARY_PATH).trim()) || DEFAULT_RELATION_VOCABULARY_PATH;

  let terms: RelationTermDef[] = [];
  let file: TFile | null = null;
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) {
    try {
      const raw = await app.vault.cachedRead(existing);
      const parsed = JSON.parse(raw) as Partial<RelationVocabularyFile>;
      terms = Array.isArray(parsed.terms) ? parsed.terms.filter(isValidTerm) : [];
    } catch (err) {
      console.warn(`MemVector: could not parse ${path}, reseeding before appending custom types:`, err);
      terms = [];
    }
  }
  if (terms.length === 0) terms = [...DEFAULT_RELATION_VOCABULARY];

  const knownLabels = new Set(terms.map((t) => t.label.toUpperCase()));
  const knownKeys = new Set(terms.map((t) => t.key));

  let appended = 0;
  for (const custom of customTypes) {
    const label = (custom.label || "").trim().toUpperCase();
    if (!label) continue;
    if (knownLabels.has(label)) continue;
    let key = `custom${label}`;
    let suffix = 2;
    while (knownKeys.has(key)) key = `custom${label}_${suffix++}`;
    terms.push({
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
  if (appended === 0) return true;

  try {
    const payload: RelationVocabularyFile = { terms };
    const content = JSON.stringify(payload, null, 2);
    if (existing instanceof TFile) {
      await app.vault.modify(existing, content);
    } else {
      await ensureParentFolder(app, path);
      await app.vault.create(path, content);
    }
    return true;
  } catch (err) {
    console.warn("MemVector: failed to persist custom relation type to vocabulary:", err);
    return false;
  }
}
