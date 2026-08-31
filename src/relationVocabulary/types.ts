/**
 * One user-facing relation term (e.g. "impliziert"), consolidating down to a
 * canonical Cypher label (e.g. "IMPLIES") shared by every synonym term. The
 * whole vocabulary is domain-defined - the plugin ships a STEM-flavored
 * default (see defaultVocabulary.ts) but a vault can replace it entirely
 * with terms for medicine, law, or anything else by editing the vocabulary
 * file (see loadRelationVocabulary.ts).
 */
export interface RelationTermDef {
  /** Stable identifier for this term, used as the dropdown option value and JSON-persisted references - never shown to the user directly. */
  key: string;
  /** Canonical Cypher relationship type this term maps to. Multiple terms may share one label. */
  label: string;
  /** Display text for this term, in whatever language/domain the vocabulary file was written in. */
  term: string;
  /** Group heading in the dropdown (e.g. "Logic", "Construction") - purely organizational. */
  category: string;
  /** Whether picking this term creates an edge that renders/queries in both directions. */
  bidirectional: boolean;
  /** True when the natural reading reverses the UI-selected src->tgt direction (e.g. "follows from": A follows from B means B->A). */
  reversed: boolean;
  /** Opt-in: include this term's label in the lean label list offered to the local LLM for edge-type suggestions. If no term in the whole vocabulary sets this, all unique labels are offered instead. */
  suggest?: boolean;
}

export interface RelationVocabularyFile {
  terms: RelationTermDef[];
}
