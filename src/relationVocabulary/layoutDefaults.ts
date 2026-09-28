import { DEFAULT_RELATION_VOCABULARY } from "./defaultVocabulary";
import type { RelationTermDef } from "./types";

/**
 * Purpose: Supplies the bundled per-label layout semantics (weight/repels, ADR-0002) for any
 * term whose vocabulary entry does not carry them itself.
 * Architecture: Vaults seeded before 0.1.7 have a wiki/relation-types.json written from a
 * vocabulary that had no weight/repels fields at all, and a preset from another domain simply
 * has no entry for a label an older edge still uses. Without this fallback both cases silently
 * collapse to DEFAULT_RELATION_WEIGHT, which turns CONFLICTS_WITH from repulsion into
 * attraction and INDEPENDENT_OF from the neutral baseline into a full pull (re-breaking
 * Issue #68). An explicit field in the file always wins, so a vault can still override or
 * deliberately neutralize a bundled default.
 */
const BUNDLED_LAYOUT_BY_LABEL = new Map<string, RelationTermDef>(
  DEFAULT_RELATION_VOCABULARY.map((def) => [def.label.toUpperCase(), def])
);

/** Bundled layout semantics for a canonical label, or undefined for a label the plugin does not ship. */
export function bundledLayoutForLabel(label: string): RelationTermDef | undefined {
  return BUNDLED_LAYOUT_BY_LABEL.get((label || "").toUpperCase());
}

/**
 * Purpose: Fills in weight/repels from the bundled STEM default for every term that omits both,
 * leaving all other fields (and any explicitly set weight/repels) untouched.
 */
export function withBundledLayoutDefaults(terms: RelationTermDef[]): RelationTermDef[] {
  return terms.map((term) => {
    if (term.weight !== undefined || term.repels !== undefined) return term;
    const bundled = bundledLayoutForLabel(term.label);
    if (!bundled || (bundled.weight === undefined && bundled.repels === undefined)) return term;
    const filled: RelationTermDef = { ...term };
    if (bundled.weight !== undefined) filled.weight = bundled.weight;
    if (bundled.repels !== undefined) filled.repels = bundled.repels;
    return filled;
  });
}

/**
 * Purpose: Applies an explicit layout edit to one term so that reloading the file yields exactly
 * the edited values, and omits a field only when the fallback would reproduce it anyway.
 * Architecture: The fallback above makes omission meaningful, which cuts both ways - dropping
 * `repels` from a CONFLICTS_WITH entry would silently restore the bundled `repels: true` on the
 * next load, so an intentional "off" has to be written as an explicit `false`. Likewise a weight
 * set to 1.0 on a label whose bundled weight is 1.3 must be written, not omitted. A field is left
 * out only when it equals the value the fallback would supply, keeping the JSON readable without
 * making the file lie about the user's choice.
 */
export function applyLayoutEdit(term: RelationTermDef, weight: number, repels: boolean): RelationTermDef {
  const bundled = bundledLayoutForLabel(term.label);
  const fallbackWeight = bundled?.weight ?? 1;
  const fallbackRepels = bundled?.repels ?? false;
  const updated: RelationTermDef = { ...term };

  // Omission only reproduces the fallback pair when BOTH fields are omitted
  // (withBundledLayoutDefaults fills nothing once either one is present).
  if (weight === fallbackWeight && repels === fallbackRepels) {
    delete updated.weight;
    delete updated.repels;
    return updated;
  }

  updated.weight = weight;
  updated.repels = repels;
  return updated;
}
