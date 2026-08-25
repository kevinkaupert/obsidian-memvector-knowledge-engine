import type { TranslationKeys } from "../../i18n";

export interface RelationTypeOption {
  val: string;
  label: string;
}

export interface RelationCategory {
  name: string;
  items: RelationTypeOption[];
}

/** 23 relation types grouped by mathematical category, labels localized via i18n. */
export function buildRelationCategories(t: TranslationKeys): RelationCategory[] {
  return [
    {
      name: t.relCatLogic,
      items: [
        { val: "IMPLIES", label: t.relImplies },
        { val: "EQUIVALENT_TO", label: t.relEquivalentTo },
        { val: "NECESSARY_CONDITION_FOR", label: t.relNecessaryCondition },
        { val: "SUFFICIENT_CONDITION_FOR", label: t.relSufficientCondition },
        { val: "CONTRADICTS", label: t.relContradicts },
        { val: "IS_INDEPENDENT_OF", label: t.relIndependentOf },
      ],
    },
    {
      name: t.relCatProofs,
      items: [
        { val: "PROVES", label: t.relProves },
        { val: "REFUTES", label: t.relRefutes },
        { val: "FOLLOWS_FROM", label: t.relFollowsFrom },
        { val: "BASED_ON", label: t.relBasedOn },
        { val: "COROLLARY_OF", label: t.relCorollaryOf },
        { val: "LEMMA_FOR", label: t.relLemmaFor },
      ],
    },
    {
      name: t.relCatDefinitions,
      items: [
        { val: "DEFINES", label: t.relDefines },
        { val: "EQUIVALENT_DEFINITION_FOR", label: t.relEquivDef },
        { val: "SPECIAL_CASE_OF", label: t.relSpecialCase },
        { val: "GENERALIZES", label: t.relGeneralizes },
        { val: "EXTENDS", label: t.relExtends },
      ],
    },
    {
      name: t.relCatStructure,
      items: [
        { val: "ISOMORPHIC_TO", label: t.relIsomorphicTo },
        { val: "EMBEDDED_IN", label: t.relEmbeddedIn },
        { val: "DUAL_TO", label: t.relDualTo },
        { val: "ANALOGOUS_TO", label: t.relAnalogousTo },
        { val: "IS_OPPOSITE_OF", label: t.relOppositeOf },
      ],
    },
    {
      name: t.relCatExamples,
      items: [
        { val: "EXAMPLE_FOR", label: t.relExampleFor },
        { val: "COUNTEREXAMPLE_FOR", label: t.relCounterexampleFor },
        { val: "CUSTOM", label: t.relCustom },
      ],
    },
  ];
}
