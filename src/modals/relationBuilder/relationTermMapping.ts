import { sanitizeRelType } from "../../sync/memgraph/cypherBuilder";
import type { TranslationKeys } from "../../i18n";
import type { RelationEdgeDraft, RelationNode } from "./relationEdgeBuilder";

/** The 13 standardized Cypher relationship types every German relation term consolidates down to. */
export type RelationLabel =
  | "IMPLIES"
  | "REQUIRES"
  | "EQUIVALENT_TO"
  | "GENERALIZES"
  | "SPECIALIZES"
  | "EXTENDS"
  | "REDUCES_TO"
  | "CONSTRUCTS"
  | "EMBEDS_IN"
  | "REFUTES"
  | "CONFLICTS_WITH"
  | "INDEPENDENT_OF"
  | "ANALOGOUS_TO";

export interface RelationTermInfo {
  label: RelationLabel;
  bidirectional: boolean;
  /** true = the natural reading reverses the UI-selected src->tgt direction (e.g. "folgt aus": A folgt aus B means B->A). */
  reversed: boolean;
}

/** Keyed by i18n key name (stable across language switches, and doubles as the dropdown option value) rather than by display text. */
const TERM_MAP: Record<string, RelationTermInfo> = {
  relImplies: { label: "IMPLIES", bidirectional: false, reversed: false },
  relSufficientCondition: { label: "IMPLIES", bidirectional: false, reversed: false },
  relProves: { label: "IMPLIES", bidirectional: false, reversed: false },
  relInduces: { label: "IMPLIES", bidirectional: false, reversed: false },
  relCharacterizes: { label: "IMPLIES", bidirectional: false, reversed: false },
  relFollowsFrom: { label: "IMPLIES", bidirectional: false, reversed: true },

  relBasedOn: { label: "REQUIRES", bidirectional: false, reversed: false },
  relPresupposes: { label: "REQUIRES", bidirectional: false, reversed: false },
  relNecessaryCondition: { label: "REQUIRES", bidirectional: false, reversed: true },

  relEquivalentTo: { label: "EQUIVALENT_TO", bidirectional: true, reversed: false },
  relEquivDef: { label: "EQUIVALENT_TO", bidirectional: true, reversed: false },
  relCorresponds: { label: "EQUIVALENT_TO", bidirectional: true, reversed: false },

  relGeneralizes: { label: "GENERALIZES", bidirectional: false, reversed: false },

  relSpecialCase: { label: "SPECIALIZES", bidirectional: false, reversed: false },
  relExampleFor: { label: "SPECIALIZES", bidirectional: false, reversed: false },
  relDegenerateCaseOf: { label: "SPECIALIZES", bidirectional: false, reversed: false },

  relExtends: { label: "EXTENDS", bidirectional: false, reversed: false },
  relExtensionOf: { label: "EXTENDS", bidirectional: false, reversed: false },
  relAdjunctionOf: { label: "EXTENDS", bidirectional: false, reversed: false },

  relReducesTo: { label: "REDUCES_TO", bidirectional: false, reversed: false },
  relCorollaryOf: { label: "REDUCES_TO", bidirectional: false, reversed: false },
  relLemmaFor: { label: "REDUCES_TO", bidirectional: false, reversed: true },

  relGeneratedBy: { label: "CONSTRUCTS", bidirectional: false, reversed: false },
  relProductOf: { label: "CONSTRUCTS", bidirectional: false, reversed: false },
  relCoproductOf: { label: "CONSTRUCTS", bidirectional: false, reversed: false },
  relQuotientOf: { label: "CONSTRUCTS", bidirectional: false, reversed: false },
  relClosedUnder: { label: "CONSTRUCTS", bidirectional: false, reversed: false },

  relEmbeddedIn: { label: "EMBEDS_IN", bidirectional: false, reversed: false },
  relRetractsTo: { label: "EMBEDS_IN", bidirectional: false, reversed: false },

  relRefutes: { label: "REFUTES", bidirectional: false, reversed: false },
  relCounterexampleFor: { label: "REFUTES", bidirectional: false, reversed: false },

  relContradicts: { label: "CONFLICTS_WITH", bidirectional: true, reversed: false },
  relIndependentOf: { label: "INDEPENDENT_OF", bidirectional: true, reversed: false },

  relAnalogousTo: { label: "ANALOGOUS_TO", bidirectional: true, reversed: false },
  relDualTo: { label: "ANALOGOUS_TO", bidirectional: true, reversed: false },
  relOppositeOf: { label: "ANALOGOUS_TO", bidirectional: true, reversed: false },
  relIsomorphicTo: { label: "ANALOGOUS_TO", bidirectional: true, reversed: false },
};

export function resolveRelationTerm(termKey: string): RelationTermInfo | null {
  return TERM_MAP[termKey] ?? null;
}

/** For pre-selecting a dropdown option when editing an existing edge that only has the stored canonical label - picks the first term that maps to it, or null if the label predates this vocabulary (RelationBuilderModal falls back to the free-text "Custom" field in that case). */
export function defaultTermForLabel(label: string): string | null {
  const upper = (label || "").toUpperCase();
  for (const [termKey, info] of Object.entries(TERM_MAP)) {
    if (info.label === upper) return termKey;
  }
  return null;
}

export interface ResolvedRelationEdge {
  src: RelationNode;
  tgt: RelationNode;
  label: string;
  bidirectional: boolean;
  originalTerm: string;
}

/**
 * Resolves each draft edge's chosen dropdown value (an i18n key from
 * relationCategories.ts, or "CUSTOM") into its final Cypher label,
 * bidirectional flag, and display term - swapping src/tgt for terms whose
 * natural reading reverses direction (e.g. "folgt aus"). Shared by the
 * cypher preview and the actual save, so they can never disagree.
 */
export function resolveEdgesForSave(
  edges: RelationEdgeDraft[],
  edgeRelTypes: Record<number, string>,
  customType: string,
  t: TranslationKeys
): ResolvedRelationEdge[] {
  return edges.map((e, idx) => {
    const termKey = edgeRelTypes[idx];
    const info = termKey && termKey !== "CUSTOM" ? resolveRelationTerm(termKey) : null;

    if (!info) {
      const label = sanitizeRelType(termKey === "CUSTOM" || !termKey ? customType : termKey);
      return { src: e.src, tgt: e.tgt, label, bidirectional: false, originalTerm: customType || label };
    }

    const originalTerm = (t as unknown as Record<string, string>)[termKey] || termKey;
    return info.reversed
      ? { src: e.tgt, tgt: e.src, label: info.label, bidirectional: info.bidirectional, originalTerm }
      : { src: e.src, tgt: e.tgt, label: info.label, bidirectional: info.bidirectional, originalTerm };
  });
}
