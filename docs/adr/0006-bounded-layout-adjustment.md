# 0006 — Bounded Layout Adjustment Instead of Continuous Re-Simulation

Status: Accepted (supersedes ADR-0005; implementation tracked in #206 and #185)

## Context

ADR-0005 introduced persisted node positions so the 2D view reopens with a familiar layout, and decided that nodes are "not locked or pinned": every layout pass runs the full force simulation over all nodes, starting from the stored or in-memory coordinates.

In the code as of 0.2.1 this has the following effects:

1. **Every vault event runs the full pipeline.** Any Markdown `create`, `modify`, `delete` or `rename` triggers `triggerVaultRescan` (800 ms debounce). It re-reads every Markdown file, reloads every stored vector, all positions, all relation notes and the vocabulary, rebuilds the n x n similarity matrix, runs 60 simulation iterations over all n x n pairs and writes all positions. Obsidian autosaves about every 2 s while typing, so this happens on almost every typing pause. A relation note edit triggers a layout pass after 400 ms, even when only its description changed.
2. **Most of these passes have no layout-relevant input change.** The layout uses the word features of the first 800 characters of a note, the links and formulas of the whole note, its type, title and folder, its vector, the relation edges with their vocabulary weights, the spacing settings, the knowledge domain and whether WikiLinks act as relations. Text edits beyond the excerpt that touch no link or formula, edits of excluded or filtered-out notes, and description-only relation edits change none of them. Views in background tabs compute as well.
3. **Each pass is expensive.** Measured for the layout step alone (similarity matrix plus simulation, synthetic data, 1024-dimensional vectors, main thread): about 0.13 s for 200 notes, 0.8 s for 500, 3.4 s for 1000 and 12.7 s for 2000. File reads, vector hydration and the database write come on top.
4. **Unchanged inputs still move every node.** Each pass restarts the annealing at `alpha = 0.5`, which re-heats a warm-started layout, and a center gravity pulls every node toward the origin (an unopposed node moves about 4.5 % per pass). In a measurement with 300 clustered notes and no input change, the layout contracted by about 17 % over the first passes and then kept moving each node by about 83 units per pass (node spacing 350) without converging.
5. **Every pass is persisted.** Positions are written after every pass, with no movement threshold, and each write exports and stores the entire SQLite database including all vectors.
6. **Some layout state is global.** `rescaleSimilarityMatrix` normalizes all similarities by the vault-wide 1st and 99th percentiles, so one added note can shift every matrix value. `assignClouds` reassigns all cluster ids (used for cluster hull rendering) on every pass.
7. **Scans can overlap.** `scanVaultNotes` has no guard against concurrent runs; the relation-notes toggle starts an immediate scan in addition to the debounced watcher scan.

ADR-0005 also states that positions are persisted "whenever a layout calculation settles", that writes are "debounced per layout pass" and that new nodes are seeded "near the barycenter of their connected neighbors". None of these matches the code: there is no settle detection, writes are neither debounced nor batched, and a new node is seeded next to its single most similar placed node.

The result is avoidable CPU load and UI freezes while editing, and a layout that keeps shuffling for as long as events arrive, which defeats the purpose of preserving positions.

## Decision

Existing coordinates are preserved on reopen and for unchanged layout inputs. Data updates do not trigger an automatic rearrangement. Relevant changes lead to a bounded adjustment starting from the existing arrangement. A full rearrangement is an explicit action.

The previous rule "nodes are not locked or pinned" is replaced by the distinction between **bounded automatic adjustment** and **free rearrangement**.

### 1. Layout inputs decide whether anything is computed

- A cache holds the prepared layout inputs per note: identity, folder, type, title, word features of the excerpt, links and formulas of the whole note, and the vector used together with its embedding fingerprint.
- Relation edges count with their endpoints and effective forces (type weight, attraction or repulsion, direction). A description change alone is not a layout input.
- Signatures are derived from these prepared inputs, not from a hash of the whole Markdown content, which would be too coarse.
- Global inputs are the vocabulary weights, the spacing settings, the embedding fingerprint, the knowledge domain and whether WikiLinks act as relations.
- On opening the view there is no previous pass to compare against. If every node has a stored position, the cache is initialized from the current inputs without a simulation and the stored positions are shown unchanged; only nodes without a stored position count as a change.

| Change | Reaction |
|---|---|
| Display data or relation description changed | Update data, redraw |
| Layout inputs unchanged | Keep positions; no simulation, no write |
| New note or changed relation | Bounded adjustment of the affected area |
| New vector set, or an explicit rearrangement | Larger layout run allowed |

### 2. Bounded adjustment

- New nodes are placed next to matching existing neighbors.
- Affected nodes and their surroundings may move.
- Existing positions act as soft anchors that limit global displacement.
- A bounded adjustment does not re-heat the whole layout.
- The similarity normalization bounds and the cluster assignment are kept and only recomputed on a larger layout run or an explicit rearrangement. Otherwise a local change would be numerically global.

Only lowering the starting `alpha` is not a sufficient implementation of this decision: it slows the movement down but prevents neither the unnecessary computation nor the drift.

### 3. Free rearrangement

A free global layout run is only performed on an explicit user action, and when a new vector set makes the existing arrangement obsolete. The spacing sliders are an explicit action and may run a global pass.

### 4. Event handling, computation and persistence

- Vault events go through one queue per view. Several changes to the same file are coalesced; a `modify` re-reads only that file. A full scan remains for the initial open and for recovery after missed events.
- Events for notes outside the indexing exclusions or the view filter are ignored, except for relation notes and the vocabulary file, which can change forces between visible nodes. A `rename` is evaluated for both its old and its new path.
- The result of an older scan never overwrites a newer state.
- A view that is not visible collects changes and updates once when it becomes visible. A view in a split pane counts as visible.
- Position writes are batched. Only coordinates that moved beyond a tolerance relative to the last successfully persisted state are written. Nothing is written when nothing moved.
- The last persisted state is only updated after a successful write, to the snapshot that was written. A failed write leaves the changes pending.

### Retained from ADR-0005

- Deterministic vault scanning (path-sorted, notes start unplaced).
- Sign-canonical PCA and spectral projections for the initial placement.
- Warm start from positions persisted in SQLite.
- Camera persistence through the workspace state.

## Consequences

- Editing notes no longer moves the map unless the edit changes a layout input, and then only locally. The familiar arrangement stays stable within a session and across restarts.
- CPU load while editing drops to the cost of re-reading the changed file and comparing signatures for the common case.
- Declared relations still pull and push their endpoints, but only within the affected area; a globally optimal arrangement requires the explicit rearrangement.
- Layout correctness now depends on the signature cache being complete. An input the signature misses would silently stop updating the layout, so every new layout input must be added to the signature.
- A user-visible "Rearrange" action is required. Its placement in the view is a separate UI decision.
- Statements about settling and debounced writes are only made again once mechanisms for them exist.

### Acceptance criteria

- Repeated events without changed layout inputs cause zero simulation runs, zero position writes and zero coordinate changes.
- Tests with the real simulation (not mocked) bound the movement of existing nodes on local changes.

### Deferred

- Running large, necessary layout runs in a worker. Removing the unnecessary work comes first; a worker is reconsidered when explicit rearrangements of large vaults remain too slow.
