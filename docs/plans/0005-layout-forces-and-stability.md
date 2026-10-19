# 0005 - Layout forces and stability

Status: Draft - step 1 (inventory) done and reviewed by Codex, steps 2-4 open
Date: 2026-10-19
Issues: #284 (stable 2D view, configurable forces), #283 (cloud spacing also spaces unrelated points)
Decision: successor of ADR-0006 once steps 3 and 4 are decided
Coordination: knowOS Plan 0010 phase C

## Goal

The 2D view opens the way the owner knows it, and every force that places notes is a setting the user can set,
0 switching it off (owner, 2026-10-19; no separate layout modes). This plan is worked in four steps:

1. **Inventory** (this document): every force and every trigger, with source, formula, reach, existing setting and
   interactions.
2. **Characterize today's behavior** with small cases before anything changes.
3. **Stabilize** and record the stabilized behavior as the reference.
4. **Configurable forces**, checked against the reference from step 3.

Each step follows the knowOS phase 4 procedure: written plan reviewed by Codex, tests first, owner check in the
integration vault.

All references are to memvector `7492ce1` (0.3.5). Paths are relative to `src/views/vectorScatter/layout/` unless
stated otherwise.

## 1. Pipeline

```
scan (vaultScan.ts, isInScanScope)          node set: exclusions, filter query, relation notes
  -> hybrid similarity S(a,b)               similarity.ts calcSimilarity, buildSimilarityMatrix
  -> rescale to [0,1] (vault percentiles)   similarity.ts computeRescaleBounds, rescaleSimilarityMatrix
  -> cluster assignment (display only)      cloudAssignment.ts assignClouds
  -> graph weights conn[i][j], repel set    graphTopologyWeights.ts computeGraphTopologyWeights
  -> initial / incremental placement        projections.ts placeInitial, placeIncremental
  -> force simulation, 60 iterations        projections.ts simulateForces
  -> settle passes (from scratch only)      layoutEngine.ts settle
```

`LayoutEngine.run` (layoutEngine.ts) decides per request whether nothing, a bounded pass or a free pass runs.

## 2. Inputs to the pair affinity

### 2.1 Hybrid similarity `S(a,b)` (similarity.ts:42, weights in applyVectorLayout.ts `SIMILARITY_WEIGHTS`)

| Component | Raw value | Weight (fixed, not a setting) | Notes |
|---|---|---|---|
| Embedding cosine | `(cos + 1) / 2`, clamped to [0,1] | `vector` 0.5 | only when both notes have a vector |
| WikiLink | 0.75 if either note links the other's basename, else 0 | `wikiLinks` 0.3 | **always on**, independent of the WikiLink setting |
| Folder | 0.4 if same non-empty parent folder, else 0 (two notes at the vault root get 0) | `folder` 0.1 | |
| Words or formulas | Jaccard of ASCII word tokens (`[a-z0-9_]{3,}`) from the first 800 characters of the body without frontmatter (vaultScan.ts:79, 92); in the math domain formula overlap `|A ∩ B| / max(1, min(|A|, |B|))` over formulas from the whole note | `semantics` 0.1 | `knowledgeDomain = math` switches words to formulas |

Without vectors on both sides the vector weight is split onto words and links (`weights.vector * 0.5` each).
`S` is capped at 1.

### 2.2 Rescale (similarity.ts:132-206)

Off-diagonal values are stretched linearly to [0,1] between the 1st and 99th percentile of the vault (min/max for at
most 50 pairs), computed over embedded notes when there are at least two (with exactly one embedded note, its pairs
are left out). No rescale happens without bounds or with a spread below 1e-6, so a two-note vault keeps raw values.
The bounds are **vault-relative**: a full pass can shift every pair. A bounded pass reuses the engine's stored bounds
(`fixedBounds`); after reopening with stored positions these are recomputed from the current vault without a free
pass (layoutEngine.ts:65), so they need not be the bounds that produced the stored layout.

### 2.3 Graph weight `conn[i][j]` (graphTopologyWeights.ts:51)

| Source | Weight | Setting |
|---|---|---|
| Typed relation (confirmed only, VectorScatterView `confirmedEdges`) | vocabulary `weight`, default 1.0 | per type in the vocabulary (ADR-0002) |
| Repelling relation type (`repels: true`, e.g. CONFLICTS_WITH) | goes into the repel set, not `conn` | per type |
| WikiLink | 0.7 | `includeWikiLinksAsRelations` (default off) |
| 2 / 3 / 4 hops apart | 0.12 / 0.08 / 0.05 (`HOP_DECAY`) | none |
| Anything else | 0.05 (`BASELINE_WEIGHT`) | none |

Several edges between one pair keep the maximum weight. A relation label missing from the active vocabulary keeps its
bundled semantics (`resolveRelationForce`, graphTopologyWeights.ts:41): an old CONFLICTS_WITH still repels after a
switch to a vocabulary without it; only unknown labels fall back to weight 1.

## 3. Forces in the simulation (projections.ts `simulateForces`, 391-503)

Distances in canvas units. `s` = node spacing (setting, default 350, slider 120-1600), `c` = cloud spacing (setting,
default 800, slider 300-3000). Per node and iteration all forces are summed, then one step is taken.

| # | Force | Acts on | Formula | Reach | Setting today |
|---|---|---|---|---|---|
| F1 | Centering | each node, free pass only | `-pos * 0.003` | global | none |
| F2 | Anchor | mobile node with a previous position, bounded pass only | `(anchor - pos) * ANCHOR_STIFFNESS (0.08)` | own anchor | none |
| F3 | Conflict repulsion | pairs with a repelling relation | push `min(0.6s, (2.5s - d) * 0.5)` if `d < 2.5s`; skips F4-F6 for the pair | `2.5s` | vocabulary `repels` |
| F4 | Collision | every pair | push `min(s, (clear - d) * 0.85)` if `d < clear`; `clear = max(0.12s, max(60, 0.45s) / wf)` | `clear` | none (scales with `s`) |
| F5 | Unrelated repulsion | pairs with affinity < 0.15 | push `min(0.4s, (R - d) * 0.15)` if `d < R`; `R = max(1.5s, 0.7c)` | `R` | node and cloud spacing |
| F6 | Spring | pairs with affinity >= 0.15 | target `max(0.12s, s(1.15 - 0.75a) / wf)`; pull `min(0.5s, delta * a * 0.3 * wf)`, push `min(0.3s, -delta * a * 0.2)` | all such pairs | indirect: similarity, relation weights |

with

- `a = affinity = max(min(1, conn), S^2)` (projections.ts:465): graph and similarity are **not added**; the larger
  one wins.
- `wf = weight factor = min(MAX_RELATION_WEIGHT_FACTOR (6), max(1, conn))`: only relation weights above 1 shorten
  distances and stiffen springs.
- Step: `min(|F| * alpha, min(0.3s, 80) * alpha)`, `alpha = start * (1 - iter/60)` for iter 0..59 with start 0.5 (free)
  or 0.15 (bounded), so the last step still has alpha `start/60`. A bounded pass stops early when no node moved more
  than 0.5. Summed over 60 iterations one node moves at most `30.5 * start * min(0.3s, 80)`: about 366 units in a
  bounded pass, about 1220 in a free pass.
- Exactly coincident nodes exert no pair force on each other (`dist = hypot || 1` with a zero direction vector).
- Nodes move one after the other within an iteration, so later nodes see earlier moves (order-dependent by design).

### 3.1 Placement before the simulation (projections.ts:310-370)

| Case | Placement | Uses |
|---|---|---|
| No node placed (first layout, rearrange) | 2D PCA of the vectors scaled to `0.75c`; else matrix projection scaled to `0.75c` plus an offset of radius `0.05c * sqrt((i % 25) + 1)` (projections.ts:220); else a golden-angle spiral (`0.5s * sqrt(i)`) | `c`, `s` |
| PCA, note without vector | next to the most similar embedded note (`0.4s`) if `S > 0.15`, else on a ring at `0.75c` | |
| Some nodes placed | each unplaced node next to its most similar placed node (`0.4s`) if `S > 0.15`, else near the origin (`0.5s`) | |

Placement already decides much of the result: the simulation runs 60 iterations with capped steps and cannot always
undo a far-off start.

### 3.2 Clusters (cloudAssignment.ts)

`assignClouds` aims at `max(2, min(8, floor(sqrt(n))))` centroids (k-means++ style on `S`; one cluster for very small
sets, fewer when the remaining candidates are all more than 0.75 similar to a centroid) and labels each node with its
nearest centroid. **Clusters exert no force**: `cloudId` is display only. "Cloud spacing" acts through F5's radius and
the initial placement (PCA and matrix projection radius, ring for notes without a vector), never between clusters.

## 4. Triggers (what moves notes)

`LayoutEngine.run(mode)` with `auto` (default), `global` or `rearrange`:

| Trigger | Caller | Mode | Result today |
|---|---|---|---|
| View opens, all notes have stored positions | fullScan (VectorScatterView.ts:767) | auto | nothing moves; state initialized |
| View opens, some notes without position | fullScan | auto | bounded pass: new notes placed, their neighbors may move |
| Note changed, created, renamed, deleted (vector, links, folder, content words) | vault watcher -> incremental update (VectorScatterView.ts:620) | auto | bounded pass over the changed notes, their relation (and WikiLink, if enabled) neighbors and their 5 most similar notes (`SIMILAR_NEIGHBORS_MOBILE`); free pass if more than 50% of notes changed (`LARGE_CHANGE_RATIO`) |
| Relation saved or edited | relation builder | auto | bounded pass around both endpoints |
| Relation deleted | relation builder, `relationChangeLayoutMode` (VectorScatterView.ts:52) | **rearrange** | full layout from scratch |
| Vocabulary edited (weights, repels), vocabulary preset or path, relations folder | settings, `relayout` (VectorScatterView.ts:100; relationTypesSection.ts:119, 149; folderSettings.ts:39) | auto | bounded pass around edges whose force changed |
| Relation file deleted or edited outside the builder, frontmatter typed links, vocabulary file edited | vault watchers (vaultWatchers.ts:54) | auto | bounded pass; only the builder's delete rearranges |
| Indexing exclusions | settings (generalSection.ts:74) | rescan, auto | node set changes |
| Vectors calculated / reloaded | `onVectorsCalculated`, `reloadEmbeddings` (VectorScatterView.ts:796, 893) | auto | bounded, or free when more than 50% changed (typical after a first run) |
| Background indexing of an edited note | vaultIndexPipeline.ts:248 notifies the change, and again when a new vector was stored (:269; skipped when the content hash is unchanged) | auto, once or twice | one or two bounded passes; the second re-anchors at positions after the first |
| Node or cloud spacing slider | toolbar.ts:130, 140 | auto, but `settingsChanged` | free pass from current positions |
| Knowledge domain, WikiLink setting | settings | auto, but `settingsChanged` | free pass from current positions |
| Filter query, relation-note toggle | scan scope (`isInScanScope`, vaultScan.ts:37) | auto | notes leave or enter the node set: removed ones vanish, returning ones are "added" and trigger a bounded pass around them |
| "Layout neu anordnen" | toolbar | rearrange | from scratch plus `min(6, floor(250000 / n^2))` settle passes, each a full free simulation, stopping below `0.05s` largest move; none above 500 notes |

Details that decide between nothing, bounded and free (layoutEngine.ts:82-150):

- No-op: if no layout signature changed (e.g. a relation description, a type change with the same effective force,
  reloaded but identical vectors), nothing moves.
- The 50% threshold counts added, changed **and** relation-endpoint notes against the current node count; missing
  stored bounds also force a free pass. Small vaults therefore reach a free pass quickly.
- Removed notes (deleted or filtered out) are no seeds. Removing a note without relations moves nobody; removing an
  endpoint of a typed relation drops that edge, and the remaining endpoint becomes a seed (layoutInputs.ts:139).
- Events are coalesced (800 ms notes, 400 ms relations, vaultEventQueue.ts); a hidden view collects changes and
  processes them when shown, so the threshold applies to the accumulated batch.
- After a failed vector read every layout request is suppressed, including rearrange, until a complete read succeeds
  (VectorScatterView.ts:850, #191).

A free pass after a settings change recomputes the rescale bounds and clusters for the whole vault.

## 5. Findings

1. **WikiLinks act twice.** Always through `S` (weight 0.3 of a 0.75 raw value) and, when enabled, as graph weight
   0.7. The WikiLink setting removes only the second path.
2. **No independent forces.** `affinity = max(graph, S^2)` means a strong relation hides similarity and vice versa.
   A slider per force needs an explicit combination rule (max, sum, or weighted sum).
3. **Cloud spacing is a point repulsion radius (#283).** F5 uses `R = max(1.5s, 0.7c)` for every unrelated pair; it
   never checks clusters, and clusters exert no force. Raising it spreads all unrelated points, not clouds.
4. **Similarity is vault-relative.** The rescale bounds move with the note set; only bounded passes keep them fixed.
   A free pass after a slider move can shift every pair.
5. **Bounded means "who and how fast", not a stated distance.** The anchor is a soft spring (0.08). One bounded pass
   moves a note at most about 366 units (step budget), but there is no limit across events: a second notification
   after a new vector, or several edits in a row, each re-anchor at the new position.
6. **Some explicit actions rearrange more than expected.** Deleting a relation rearranges from scratch; the spacing
   sliders and two settings run a free pass over all notes.
7. **Filters are layout inputs.** The filter query and the relation-note toggle change the node set. Hiding notes
   moves nobody unless a hidden note ends a typed relation (its partner becomes a seed), but a note shown again comes back as "added" and is adjusted together
   with its neighbors, and a large re-shown set crosses the 50% threshold and runs a free pass. To be confirmed in
   step 2 whether stored positions are reused unchanged.
8. **Hidden tunables.** Similarity weights (0.5/0.3/0.1/0.1), raw link and folder values (0.75, 0.4), hop decay,
   baseline weight, the 0.15 affinity threshold, spring constants and the centering factor are code constants.
9. **Placement matters.** PCA/spiral start and incremental placement next to the most similar note shape the result
   before any force acts, and 60 capped iterations do not always undo them.

## 6. Characterization cases for step 2

Each case fixes inputs and asserts relations between distances (not exact coordinates), plus one golden snapshot per
case for regression:

| Case | Setup | Observed today (to record) |
|---|---|---|
| C1 linked pair | two notes with a WikiLink, setting off / on | distance vs. an unlinked pair; effect of the setting |
| C2 similar pair | two notes with close vectors, no link | distance vs. a dissimilar pair |
| C3 relation pair | typed relation weight 1, 3, 6 | distance per weight; relation vs. similarity when both apply (`max`) |
| C4 conflict pair | CONFLICTS_WITH between similar notes | distance >= 2.5s? |
| C5 unrelated points | several unrelated notes, cloud spacing 300 / 3000 | pairwise distances scale with cloud spacing (#283) |
| C6 several groups | two groups of similar notes | group separation vs. cloud spacing |
| C7 stability | open again, filter hide/show, edit one note, delete a relation, move a slider | per trigger: maximum movement of untouched notes |

C7 measures the stability definition of #284: maximum movement of untouched notes per event, and reopen = identical
positions.

## 7. Open decisions (before step 4)

- Combination rule of graph and similarity: keep `max`, switch to a (weighted) sum, or separate springs. A sum
  changes the layout by itself, so it is decided against the step 3 reference.
- Which forces become settings: candidates are similarity (and its parts), typed relations, WikiLinks (one path, not
  two), repulsion of unrelated notes, centering, collision. 0 must remove a force entirely, including its share in `S`.
- Meaning of node and cloud spacing afterwards (#283): cloud spacing as distance between clusters needs clusters to
  exert a force; otherwise it may be dropped in favor of a repulsion setting.
- Movement bound: a hard maximum distance per event for untouched notes, or a stronger anchor.
- Triggers: relation delete as bounded instead of rearrange; slider changes as rescale of existing positions or a
  bounded pass instead of a free pass; filters as visibility only.
