import type { RelationTermDef } from "./types";

/**
 * The plugin's bundled STEM vocabulary: exactly one entry per canonical Cypher
 * label (17 total). Per-label layout semantics (weight/repels, ADR-0002) live
 * here as the single source of truth for the defaults. Vaults seed
 * wiki/relation-types.json from this list on first use and can extend or
 * replace it freely.
 */
export const DEFAULT_RELATION_VOCABULARY: RelationTermDef[] = [
  // Logic & Implication
  { key: "relImplies", label: "IMPLIES", term: "implies", category: "Logic & Implication", bidirectional: false, reversed: false, canvas: { slot: "S", subject: "source" } },
  { key: "relEquivalentTo", label: "EQUIVALENT_TO", term: "is equivalent to", category: "Logic & Implication", bidirectional: true, reversed: false, weight: 1.3 },
  { key: "relConflictsWith", label: "CONFLICTS_WITH", term: "conflicts with", category: "Logic & Implication", bidirectional: true, reversed: false, repels: true },
  { key: "relIndependentOf", label: "INDEPENDENT_OF", term: "is independent of", category: "Logic & Implication", bidirectional: true, reversed: false, weight: 0.05 },

  // Preconditions
  { key: "relRequires", label: "REQUIRES", term: "requires", category: "Preconditions", bidirectional: false, reversed: false, canvas: { slot: "N", subject: "source" } },
  // Foundation chain concept -> definition -> simpler concept -> primitive notion -> axiom (#242)
  { key: "relDefinedBy", label: "DEFINED_BY", term: "is defined by", category: "Preconditions", bidirectional: false, reversed: false, canvas: { slot: "W-up", subject: "source" } },
  { key: "relUses", label: "USES", term: "uses", category: "Preconditions", bidirectional: false, reversed: false },
  { key: "relGovernedBy", label: "GOVERNED_BY", term: "is governed by", category: "Preconditions", bidirectional: false, reversed: false },

  // Generalization & Specialization
  { key: "relGeneralizes", label: "GENERALIZES", term: "generalizes", category: "Generalization & Specialization", bidirectional: false, reversed: false, canvas: { slot: "E-up", subject: "new" } },
  { key: "relSpecializes", label: "SPECIALIZES", term: "is special case of", category: "Generalization & Specialization", bidirectional: false, reversed: false },
  { key: "relExtends", label: "EXTENDS", term: "extends", category: "Generalization & Specialization", bidirectional: false, reversed: false },
  { key: "relExampleOf", label: "EXAMPLE_OF", term: "is an example of", category: "Generalization & Specialization", bidirectional: false, reversed: false, canvas: { slot: "E-down", subject: "new" } },

  // Proofs & Corollaries
  { key: "relReducesTo", label: "REDUCES_TO", term: "reduces to", category: "Proofs & Corollaries", bidirectional: false, reversed: false },

  // Construction & Embedding
  { key: "relConstructs", label: "CONSTRUCTS", term: "is constructed from", category: "Construction & Embedding", bidirectional: false, reversed: false },
  { key: "relEmbedsIn", label: "EMBEDS_IN", term: "is embedded in", category: "Construction & Embedding", bidirectional: false, reversed: false },

  // Refutation & Counterexamples
  { key: "relRefutes", label: "REFUTES", term: "refutes", category: "Refutation & Counterexamples", bidirectional: false, reversed: false, canvas: { slot: "W-down", subject: "new" } },

  // Structure & Analogy
  { key: "relAnalogousTo", label: "ANALOGOUS_TO", term: "is analogous to", category: "Structure & Analogy", bidirectional: true, reversed: false, weight: 1.1 },
];
