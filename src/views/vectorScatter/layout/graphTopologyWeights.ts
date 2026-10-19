import type { RelationTermDef } from "../../../relationVocabulary/types";
import { DEFAULT_RELATION_VOCABULARY } from "../../../relationVocabulary/defaultVocabulary";
import { bundledLayoutForLabel } from "../../../relationVocabulary/layoutDefaults";

/** Weight of a relation type the vocabulary does not define and that has no bundled semantics. */
const DEFAULT_RELATION_WEIGHT = 1.0;

export type RelationForce = { repels: true } | { repels: false; weight: number };

/**
 * Purpose: Indexes a relation vocabulary by upper-cased label; the first definition per label wins.
 * Architecture: Matches the Settings type table, which also collapses synonym entries to one row per canonical label.
 */
export function buildLabelIndex(vocabulary: RelationTermDef[] = DEFAULT_RELATION_VOCABULARY): Map<string, RelationTermDef> {
  const labelIndex = new Map<string, RelationTermDef>();
  for (const def of vocabulary) {
    const labelKey = def.label.toUpperCase();
    if (!labelIndex.has(labelKey)) labelIndex.set(labelKey, def);
  }
  return labelIndex;
}

/**
 * Purpose: Resolves the layout force a relation type exerts: repulsion, or attraction with a weight.
 * Architecture: A label the active vocabulary does not define at all (e.g. an older CONFLICTS_WITH edge after switching
 * to the Law preset) keeps its bundled layout semantics rather than silently degrading to generic attraction. Shared by
 * the simulation and the layout-input signatures, so both see the same force.
 */
export function resolveRelationForce(relType: string, labelIndex: Map<string, RelationTermDef>): RelationForce {
  const def = labelIndex.get(relType.toUpperCase()) ?? bundledLayoutForLabel(relType);
  if (def?.repels) return { repels: true };
  return { repels: false, weight: def?.weight ?? DEFAULT_RELATION_WEIGHT };
}
