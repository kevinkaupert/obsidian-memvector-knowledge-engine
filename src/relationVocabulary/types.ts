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
  /** 2D layout attraction strength for this label (default 1.0) - read by graphTopologyWeights.ts instead of hardcoded type maps (ADR-0002). */
  weight?: number;
  /** When true, this label actively pushes connected notes apart in the 2D layout instead of attracting (default false). */
  repels?: boolean;
  /** No longer offered for new relations; existing relations keep it (knowOS relation-vocabulary contract). */
  deprecated?: boolean;
  /** The term's canvas handle in Canvas Tutor (knowOS ADR-0011): one of six slots and which card is the subject. */
  canvas?: CanvasSlot;
}

/** A slot id of the contract's slot list (canvasSlots.ts); unknown ids from a newer contract are kept as they are. */
export type CanvasSlotId = string;

export interface CanvasSlot {
  slot: CanvasSlotId;
  subject: "source" | "new";
}

/**
 * A vocabulary file (a preset) as the knowOS relation-vocabulary contract defines it. Fields MemVector does not use
 * (`schema`, `name` and anything later) are kept when the file is rewritten.
 */
export interface RelationVocabularyFile {
  terms: RelationTermDef[];
  schema?: number;
  name?: string;
}
