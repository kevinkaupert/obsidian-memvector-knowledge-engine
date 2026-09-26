# 0002 — Vocabulary-Driven Layout Weights Replace Hardcoded Type Maps

Status: Accepted

## Context

The 2D force layout (`graphTopologyWeights.ts`) special-cased relation types in
hardcoded constants: `CONFLICTS_WITH` repelled, `EQUIVALENT_TO` attracted at
1.3, `ANALOGOUS_TO` at 1.1, `INDEPENDENT_OF` was neutral. The relation
vocabulary itself (`wiki/relation-types.json`, `RelationTermDef`) only carried
organizational metadata (`label`, `category`, `bidirectional`, `reversed`) —
the layout behavior of a type was invisible to anyone editing the vocabulary
file and impossible to change without patching the plugin.

Issue #119 (custom edge types, user-defined presets, per-type layout weights)
requires that layout semantics travel with the vocabulary: a custom type like
`IS_HOMOMORPHIC_TO` or a Law preset's `DEROGATES` must be able to attract
stronger, repel, or stay neutral without touching code.

## Decision

`RelationTermDef` gains two optional fields:

```ts
weight?: number;   // layout attraction strength, default 1.0
repels?: boolean;  // actively push connected notes apart, default false
```

- The bundled STEM default encodes the previous hardcoded behavior:
  `EQUIVALENT_TO: weight 1.3`, `ANALOGOUS_TO: weight 1.1`,
  `CONFLICTS_WITH: repels: true`, `INDEPENDENT_OF: weight 0.05`.
  Existing vaults keep identical layout behavior.
- `computeGraphTopologyWeights` resolves each edge's `relType` against the
  loaded vocabulary (case-insensitive label lookup) instead of consulting
  type-specific constants. No hardcoded type maps remain.
- The resolution defaults to the bundled STEM vocabulary when the caller
  passes none, so the layout never depends on a vocabulary load having
  finished; the scatter view refreshes the vocabulary together with relation
  edges (`VectorScatterView.loadRelationEdges`) so edits and auto-persisted
  custom types feed the layout immediately.
- The same `weight`/`repels` fields drive the Settings Relation Type Manager
  table and the preset files, keeping the single source of truth in the
  vault-owned JSON.

## Consequences

- Vault owners can tune layout semantics per type (and per preset) purely by
  editing vocabulary JSON or using the Settings UI — no code changes.
- Behavior for the 13 bundled STEM types is unchanged unless the vault's
  vocabulary explicitly redefines a label; a redefined label overrides the
  bundled default.
- WikiLink `LINKS_TO` edges keep their fixed 0.7 weight (opt-in, ADR-0001);
  they have no vocabulary entry by design.
- Future layout experiments (e.g. hop-decay tuning) can stay in
  `graphTopologyWeights.ts` as long as they are label-agnostic; anything
  type-specific belongs in the vocabulary.
