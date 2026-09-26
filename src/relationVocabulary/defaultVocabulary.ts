import type { RelationTermDef } from "./types";

/**
 * The plugin's bundled STEM vocabulary: exactly one entry per canonical Cypher
 * label (13 total). Per-label layout semantics (weight/repels, ADR-0002) live
 * here as the single source of truth for the defaults. Vaults seed
 * wiki/relation-types.json from this list on first use and can extend or
 * replace it freely.
 */
export const DEFAULT_RELATION_VOCABULARY: RelationTermDef[] = [
  // Logic & Implication
  { key: "relImplies", label: "IMPLIES", term: "implies", category: "Logic & Implication", bidirectional: false, reversed: false },
  { key: "relEquivalentTo", label: "EQUIVALENT_TO", term: "is equivalent to", category: "Logic & Implication", bidirectional: true, reversed: false, weight: 1.3 },
  { key: "relConflictsWith", label: "CONFLICTS_WITH", term: "conflicts with", category: "Logic & Implication", bidirectional: true, reversed: false, repels: true },
  { key: "relIndependentOf", label: "INDEPENDENT_OF", term: "is independent of", category: "Logic & Implication", bidirectional: true, reversed: false, weight: 0.05 },

  // Preconditions
  { key: "relRequires", label: "REQUIRES", term: "requires", category: "Preconditions", bidirectional: false, reversed: false },

  // Generalization & Specialization
  { key: "relGeneralizes", label: "GENERALIZES", term: "generalizes", category: "Generalization & Specialization", bidirectional: false, reversed: false },
  { key: "relSpecializes", label: "SPECIALIZES", term: "is special case of", category: "Generalization & Specialization", bidirectional: false, reversed: false },
  { key: "relExtends", label: "EXTENDS", term: "extends", category: "Generalization & Specialization", bidirectional: false, reversed: false },

  // Proofs & Corollaries
  { key: "relReducesTo", label: "REDUCES_TO", term: "reduces to", category: "Proofs & Corollaries", bidirectional: false, reversed: false },

  // Construction & Embedding
  { key: "relConstructs", label: "CONSTRUCTS", term: "is constructed from", category: "Construction & Embedding", bidirectional: false, reversed: false },
  { key: "relEmbedsIn", label: "EMBEDS_IN", term: "is embedded in", category: "Construction & Embedding", bidirectional: false, reversed: false },

  // Refutation & Counterexamples
  { key: "relRefutes", label: "REFUTES", term: "refutes", category: "Refutation & Counterexamples", bidirectional: false, reversed: false },

  // Structure & Analogy
  { key: "relAnalogousTo", label: "ANALOGOUS_TO", term: "is analogous to", category: "Structure & Analogy", bidirectional: true, reversed: false, weight: 1.1 },
];
