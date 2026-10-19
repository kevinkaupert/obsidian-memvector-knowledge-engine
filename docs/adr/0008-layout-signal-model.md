# 0008 — Layout Signal Model: One Source per Signal, Summed in One Place

Status: Accepted (supersedes ADR-0001 for the 2D layout; amends ADR-0006; Plan 0005 steps 3-4, #284, #283)

## Context

Up to 0.3.5 the 2D layout mixed its inputs in two places. A hybrid similarity `S` blended embedding cosine (0.5),
WikiLinks (0.3), folder (0.1) and word or formula overlap (0.1); a graph weight added typed relations, WikiLinks (when
"WikiLinks as relations" was on) and decayed weights for notes 2-4 hops apart. The simulation took
`max(graph weight, S^2)` per pair. Consequences, measured in Plan 0005 section 6:

- A WikiLink pulled a pair from 1098 to 385 units with the WikiLink setting **off** (through `S`); turning it on added
  nothing, because `max` was already reached. There was no way to switch WikiLinks off.
- A weight-1 relation between two similar notes changed nothing (`max` hid it).
- `S` also fed placement of new notes, the notes a local adjustment may move and the clusters, so every signal acted
  in several places.

## Decision

1. **Three signals, one source each** (`layout/signals.ts`):
   - `semantic`: embedding cosine, rescaled to [0,1] by the vault's 1st/99th percentile (fixed during local
     adjustments, ADR-0006), squared; `(cos + 1) / 2` when the bounds cannot stretch; 0 without vectors.
   - `link`: 1 when either note links the other in Obsidian's `metadataCache.resolvedLinks`, else 0. The view passes
     the resolved links and lays out again on the metadata cache's `resolved` event.
   - `relation`: the strongest attracting typed-relation weight (vocabulary, bundled fallback); repelling relations
     stay a separate repulsion.
2. **One mixing function**: `a = min(1, w_sem * semantic + w_link * link + w_rel * min(1, relation))`. A relation
   weight above 1 keeps its weight factor `min(6, max(1, w_rel * relation))` (target distance, stiffness, clearance).
   A pair attracts when `a >= 0.15`.
3. **Every consumer uses `a`**: the spring, placement (PCA of the embeddings only while `w_sem > 0`, otherwise a
   projection of `a`), the notes a local adjustment may move (link neighbors while `w_link > 0`, attracting relation
   neighbors while `w_rel > 0`, repelling neighbors always, plus the 5 notes with the highest `a`) and the clusters.
4. **Signatures follow the active signals**: a disabled signal's inputs never trigger a layout pass.
5. **Settings**: `layoutWeightSemantic`, `layoutWeightLinks`, `layoutWeightRelations`, 0-2, defaults 1 / 0.3 / 1.
   0 switches a signal off everywhere. Changing a weight is a settings change (a free pass from current positions).
6. **Removed from the layout**: folder and word/formula overlap, hop weights, the knowledge domain, and
   `includeWikiLinksAsRelations`. The latter keeps only its graph-store role: whether WikiLinks are indexed as
   `LINKS_TO` edges for synthesis.

## Consequences

- With `layoutWeightLinks = 0` a WikiLink has no effect anywhere in the layout (C1: 1098 with and without the link).
- Relation and similarity reinforce each other. The step-3 reference (C2-C7) is unchanged except one unit in C6;
  the projection goldens changed only for the two cases with relations.
- Notes without vectors are placed by links and relations only.
- Words, folders and formulas no longer influence the map; the sidebar radar (own vector search) and synthesis keep
  using them.
