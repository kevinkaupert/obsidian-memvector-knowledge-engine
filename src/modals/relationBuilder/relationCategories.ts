import type { TranslationKeys } from "../../i18n";

export interface RelationTypeOption {
  val: string;
  label: string;
}

export interface RelationCategory {
  name: string;
  items: RelationTypeOption[];
}

/**
 * 37 German relation terms, grouped by category, that all consolidate down
 * to the 13 standardized Cypher labels in relationTermMapping.ts. `val` is
 * the i18n key name (not the Cypher label - several terms share one label,
 * e.g. "beweist" and "impliziert" both mean IMPLIES) so it stays stable
 * across language switches and doubles as the resolveRelationTerm() lookup key.
 */
export function buildRelationCategories(t: TranslationKeys): RelationCategory[] {
  return [
    {
      name: t.relCatLogic,
      items: [
        { val: "relImplies", label: t.relImplies },
        { val: "relSufficientCondition", label: t.relSufficientCondition },
        { val: "relProves", label: t.relProves },
        { val: "relInduces", label: t.relInduces },
        { val: "relCharacterizes", label: t.relCharacterizes },
        { val: "relFollowsFrom", label: t.relFollowsFrom },
        { val: "relEquivalentTo", label: t.relEquivalentTo },
        { val: "relEquivDef", label: t.relEquivDef },
        { val: "relCorresponds", label: t.relCorresponds },
        { val: "relContradicts", label: t.relContradicts },
        { val: "relIndependentOf", label: t.relIndependentOf },
      ],
    },
    {
      name: t.relCatPreconditions,
      items: [
        { val: "relBasedOn", label: t.relBasedOn },
        { val: "relPresupposes", label: t.relPresupposes },
        { val: "relNecessaryCondition", label: t.relNecessaryCondition },
      ],
    },
    {
      name: t.relCatDefinitions,
      items: [
        { val: "relGeneralizes", label: t.relGeneralizes },
        { val: "relSpecialCase", label: t.relSpecialCase },
        { val: "relExampleFor", label: t.relExampleFor },
        { val: "relDegenerateCaseOf", label: t.relDegenerateCaseOf },
        { val: "relExtends", label: t.relExtends },
        { val: "relExtensionOf", label: t.relExtensionOf },
        { val: "relAdjunctionOf", label: t.relAdjunctionOf },
      ],
    },
    {
      name: t.relCatProofs,
      items: [
        { val: "relReducesTo", label: t.relReducesTo },
        { val: "relCorollaryOf", label: t.relCorollaryOf },
        { val: "relLemmaFor", label: t.relLemmaFor },
      ],
    },
    {
      name: t.relCatConstruction,
      items: [
        { val: "relGeneratedBy", label: t.relGeneratedBy },
        { val: "relProductOf", label: t.relProductOf },
        { val: "relCoproductOf", label: t.relCoproductOf },
        { val: "relQuotientOf", label: t.relQuotientOf },
        { val: "relClosedUnder", label: t.relClosedUnder },
        { val: "relEmbeddedIn", label: t.relEmbeddedIn },
        { val: "relRetractsTo", label: t.relRetractsTo },
      ],
    },
    {
      name: t.relCatExamples,
      items: [
        { val: "relRefutes", label: t.relRefutes },
        { val: "relCounterexampleFor", label: t.relCounterexampleFor },
      ],
    },
    {
      name: t.relCatStructure,
      items: [
        { val: "relAnalogousTo", label: t.relAnalogousTo },
        { val: "relDualTo", label: t.relDualTo },
        { val: "relOppositeOf", label: t.relOppositeOf },
        { val: "relIsomorphicTo", label: t.relIsomorphicTo },
      ],
    },
    {
      name: t.relCustom,
      items: [{ val: "CUSTOM", label: t.relCustom }],
    },
  ];
}
