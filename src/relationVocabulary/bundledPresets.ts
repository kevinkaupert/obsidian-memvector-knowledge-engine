import type { RelationTermDef } from "./types";

/**
 * Bundled relation-type presets beyond the STEM default (defaultVocabulary.ts).
 * Stubs are intentionally small starting points - users extend them through the
 * Settings Relation Type Manager or by editing the preset file directly.
 */
export const LAW_VOCABULARY: RelationTermDef[] = [
  { key: "lawRegulates", label: "REGULATES", term: "regulates", category: "Legislation", bidirectional: false, reversed: false },
  { key: "lawAmends", label: "AMENDS", term: "amends", category: "Legislation", bidirectional: false, reversed: false },
  { key: "lawDerogates", label: "DEROGATES", term: "derogates", category: "Legislation", bidirectional: false, reversed: false },
  { key: "lawBasedOn", label: "BASED_ON", term: "is based on", category: "Legal Hierarchy", bidirectional: false, reversed: false },
  { key: "lawConflicts", label: "CONFLICTS_WITH", term: "conflicts with", category: "Legal Hierarchy", bidirectional: true, reversed: false, repels: true },
  { key: "lawImplements", label: "IMPLEMENTS", term: "implements", category: "Legislation", bidirectional: false, reversed: false },
];

export const MEDICINE_VOCABULARY: RelationTermDef[] = [
  { key: "medTreats", label: "TREATS", term: "treats", category: "Clinical", bidirectional: false, reversed: false },
  { key: "medContraindicated", label: "CONTRAINDICATED_WITH", term: "is contraindicated with", category: "Clinical", bidirectional: true, reversed: false, repels: true },
  { key: "medCauses", label: "CAUSES", term: "causes", category: "Pathophysiology", bidirectional: false, reversed: false },
  { key: "medDiagnosedBy", label: "DIAGNOSED_BY", term: "is diagnosed by", category: "Diagnostics", bidirectional: false, reversed: true },
  { key: "medRiskFactorFor", label: "RISK_FACTOR_FOR", term: "is risk factor for", category: "Epidemiology", bidirectional: false, reversed: false },
];

export const PHILOSOPHY_VOCABULARY: RelationTermDef[] = [
  { key: "philCritiques", label: "CRITIQUES", term: "critiques", category: "Discourse", bidirectional: false, reversed: false },
  { key: "philPresupposes", label: "PRESUPPOSES", term: "presupposes", category: "Arguments", bidirectional: false, reversed: false },
  { key: "philRefutes", label: "REFUTES", term: "refutes", category: "Discourse", bidirectional: false, reversed: false },
  { key: "philEntails", label: "ENTAILS", term: "entails", category: "Arguments", bidirectional: false, reversed: false },
  { key: "philEquivalent", label: "EQUIVALENT_TO", term: "is equivalent to", category: "Arguments", bidirectional: true, reversed: false, weight: 1.3 },
];
