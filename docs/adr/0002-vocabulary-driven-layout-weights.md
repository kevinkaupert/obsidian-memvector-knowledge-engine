# 0002 — Vocabulary-Driven Layout Weights Replace Hardcoded Type Maps

Status: Accepted (extended by ADR-0003, which defines what a weight above 1.0 does)

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
- Those bundled values also act as a **fallback**, not just a seed
  (`relationVocabulary/layoutDefaults.ts`). Two cases need it, and both were
  silently broken when the fields were first introduced:
  1. A vault seeded before 0.1.7 has a `wiki/relation-types.json` written from a
     vocabulary that had no `weight`/`repels` at all. Read verbatim, every label
     would collapse to the generic `1.0`: `CONFLICTS_WITH` would attract instead
     of repel and `INDEPENDENT_OF` would jump from the neutral `0.05` to a full
     pull, re-breaking Issue #68.
  2. After switching to another domain preset, an existing edge's label may not
     appear in the active vocabulary at all.
  A term that carries neither field inherits the bundled pair for its canonical
  label; a label absent from the active vocabulary is resolved against the
  bundled set in `computeGraphTopologyWeights`. An explicitly set `weight` or
  `repels` - including `repels: false` - always wins, so a vault can still
  override or deliberately neutralize a bundled default. Labels the plugin does
  not ship get no invented semantics and keep the generic `1.0`.
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
  editing vocabulary JSON or using the Settings Relation Type Manager, which
  edits `weight` and `repels` in place per row — no code changes, and no
  delete-and-re-add that would lose the type's category, wording and
  `reversed` flag. Both fields are omitted only when the fallback below would
  reproduce the chosen pair exactly; on a label that ships bundled semantics
  they are written out, so an explicit `1.0` or `repels: false` is not silently
  restored to the bundled value on the next load (see ADR-0003 for what a
  weight above `1.0` then does).
- Behavior for the 13 bundled STEM types is unchanged unless the vault's
  vocabulary explicitly redefines a label; a redefined label overrides the
  bundled default.
- WikiLink `LINKS_TO` edges keep their fixed 0.7 weight (opt-in, ADR-0001);
  they have no vocabulary entry by design.
- Future layout experiments (e.g. hop-decay tuning) can stay in
  `graphTopologyWeights.ts` as long as they are label-agnostic; anything
  type-specific belongs in the vocabulary.
- Deleting a type from the vocabulary does not touch existing edges that use
  its label. For the 13 bundled labels the fallback above keeps their semantics;
  a deleted *custom* label falls back to the generic `1.0`, which is the
  intended reading of "this type no longer carries special meaning here".
- Every vocabulary mutation in Settings (add, remove, weight/repels edit, reset,
  preset switch) re-runs the force layout in any open 2D view
  (`applySettingsToOpenViews({ relayout: true })`), because changed weights
  move nodes - a plain redraw would only repaint the old positions.
