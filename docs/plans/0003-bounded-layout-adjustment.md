# 0003 - Bounded layout adjustment and event-driven recomputation

Status: Implemented (blocks 1-7)
Date: 2026-10-01
Issues: #206 (unnecessary recomputation), #185 (layout drift), #190 (origin used as "unplaced")
Decision: ADR-0006
Tracking: #207

## Goal

The 2D view only computes when a layout input changed, and then only as much as
the change requires:

1. Events without a layout-relevant change cause zero simulation runs, zero
   position writes and zero coordinate changes.
2. A relevant change (new note, changed relation, changed note features) moves
   only the affected area; existing positions stay recognizable.
3. A full rearrangement happens only on an explicit action, or when a new vector
   set makes the existing arrangement obsolete.
4. A view that is not visible does not compute.

## Current state

| Area | Behavior | Code |
|---|---|---|
| Vault events | Every Markdown `create`/`modify`/`delete`/`rename` runs a full rescan after 800 ms; a relation note `modify` runs a layout pass after 400 ms | `VectorScatterView.registerVaultWatchers`, `triggerVaultRescan`, `triggerRelationsReload` |
| Rescan | Re-reads every Markdown file, reloads every vector, all positions, relation notes and vocabulary | `VectorScatterView.scanVaultNotes`, `vaultScan.ts` |
| Layout pass | Rebuilds the full similarity matrix, reassigns all clusters, runs 60 iterations over all pairs, starting at `alpha = 0.5` | `layout/applyVectorLayout.ts`, `layout/projections.ts` |
| Persistence | All positions are written after every pass and the full database is exported to disk | `VectorScatterView.persistCurrentPositions`, `sqlite/nodePositions.ts`, `sqlite/sqliteDb.ts` |
| Placement flag | `(0, 0)` doubles as "unplaced" | `layout/projections.ts`, `VectorScatterView.ts` (#190) |
| Concurrency | `scanVaultNotes` has no guard against overlapping runs; the relation-notes toggle starts an immediate scan next to the debounced one | `VectorScatterView.setShowRelationNotes` |
| Tests | View tests mock `applyVectorLayout`, so movement is not covered | `VectorScatterView.test.ts` |

Measured cost of one layout pass (matrix plus simulation, synthetic data,
1024 dimensions): 0.13 s for 200 notes, 0.8 s for 500, 3.4 s for 1000, 12.7 s
for 2000. With unchanged inputs, each pass still moves every node by about 83
units on average (300 clustered notes, node spacing 350), see #185.

## Steps

Each block is committed on its own and leaves the plugin working. Blocks 1 to 5
address #206, block 6 addresses #185 and #190, block 7 is split off as #214.

### Block 1 - acceptance test and instrumentation (#208)

- Add a test harness that runs the view's scan and layout path with the real
  `applyVectorLayout` (not mocked) on a small fixture vault.
- Count simulation runs and position writes by wrapping the real functions in the
  test (no production hooks were needed), so tests
  can assert "zero runs, zero writes".
- Add the acceptance test from ADR-0006 as a failing test: repeated `modify`
  events on a note without a layout-relevant change cause zero simulation runs,
  zero position writes and zero coordinate changes. It turns green in Block 2.

### Block 2 - layout-input signatures and skipping unchanged passes (#209)

- Build the prepared layout inputs per note once per scan: identity, folder,
  word features of the 800-character excerpt, link targets and
  formulas of the whole file (both are read from the full content today), and
  the vector together with its embedding fingerprint.
- Derive a per-note signature from these prepared inputs, and a global
  signature from relation edges (endpoints, type weight, attraction or
  repulsion, direction), vocabulary weights, spacing settings, the knowledge
  domain (`knowledgeDomain`, switches word versus formula similarity) and
  `includeWikiLinksAsRelations` (adds WikiLink topology forces).
- `applyLayout` compares against the signatures of the last completed pass. If
  nothing changed: no matrix, no cluster assignment, no simulation, no write.
- Start rule: when the view opens, no previous pass exists in memory. If every
  node has a stored position, the signature cache is initialized from the
  current inputs without running the simulation, and the stored positions are
  shown unchanged. Nodes without a stored position count as a layout change;
  until Block 6 they are handled by today's pass, afterwards by seeding and
  bounded adjustment. Test: load positions, initialize the cache, existing
  nodes are displayed with their stored coordinates and nothing is written.
- Spacing sliders keep triggering a pass, since they change a global input.

### Block 3 - event queue and selective reads (#210)

- Replace the separate debounced paths with one queue per view. Events for the
  same file are coalesced; the debounce intervals stay (800 ms for notes,
  400 ms for relation notes).
- `modify` re-reads only the changed file and updates its node in place;
  `create`, `delete` and `rename` update the node set. A full scan remains for
  the initial open and for recovery (e.g. a failed incremental update).
- Ignore events for notes excluded from indexing or outside the view filter,
  with these exceptions: relation notes and the active vocabulary file are
  always processed, because they can change forces between visible nodes even
  when they are outside the node filter.
- `rename` checks both the old and the new path: a visible note moved into an
  excluded or filtered-out folder leaves the view, and a note moved in the
  other direction enters it.
- A relation note edit only reaches the layout when its effective-force
  signature changed; a description-only edit updates data and redraws.
- Every scan carries a generation number; the result of an older scan is
  discarded when a newer one has started. The relation-notes toggle enqueues
  its scan instead of starting one directly.

### Block 4 - persistence only for moved positions (#211)

- Keep the last successfully persisted coordinates in memory. They are only
  updated after a write succeeded, and then to the coordinate snapshot that
  was actually written, not to the current positions. When a write fails, the
  changes stay pending and are retried with the next write.
- Write only nodes that moved beyond a tolerance relative to them, and batch
  the writes so one burst of events results in at most one database write.
- No database export when nothing was written.

### Block 5 - no computation for hidden views (#212)

- Verify against the Obsidian API how a view detects that it is shown, including
  split panes and popout windows (expected: the view element's visibility,
  refreshed on `layout-change` and `active-leaf-change`).
- A hidden view marks itself stale and keeps collecting events; it processes
  them once when it becomes visible.

### Block 6 - bounded adjustment (#185, #190)

- Replace the `(0, 0)` sentinel with an explicit placed flag on scatter nodes,
  so a node at the origin is persisted and restored like any other (#190).
- Freeze the similarity normalization bounds and the cluster assignment; only a
  larger layout run or an explicit rearrangement recomputes them.
- On a relevant change, the mobile set is the changed or new nodes plus their
  neighborhood (relation neighbors and most similar nodes). All other nodes
  are soft-anchored to their current positions.
- The bounded run does not re-heat: it starts with low energy and stops once
  movement falls below a threshold, with the existing iteration count as an
  upper bound.
- New nodes are seeded next to matching placed neighbors, as today.
- Tests with the real simulation: a local change keeps the displacement of
  nodes outside the mobile set below a bound; unchanged inputs keep all
  positions within a tolerance.

### Block 7 - explicit rearrangement and documentation (#214)

- Add a "Rearrange" action that runs a free global layout and recomputes the
  normalization bounds and clusters. Its placement in the view is shown as an
  ASCII mock-up and agreed before implementation.
- A new vector set (model switch, re-index) also allows a larger layout run.
- Update `docs/USER_GUIDE.md`, `docs/CONFIGURATION.md` and `docs/ARCHITECTURE.md`
  to describe when the layout changes.

## Implementation notes

- Title and type were left out of the per-note signature: they only label a
  node (the cluster label is refreshed from the centroid's current title), so
  editing them is a display change.
- The new tunables live in `layout/layoutTunables.ts` instead of next to the
  constants in `layout/projections.ts`, because the position-write tolerance
  and delay are not simulation constants.
- A rename changes the node id, so it is handled as an added note with its
  previous position and vector carried over, which leads to a bounded
  adjustment.
- The large-change rule applies to the notes whose own inputs changed; their
  neighbors can make every node of a small vault mobile, which is still a
  low-energy, anchored adjustment.

## Decided

- Signatures are built from prepared layout inputs, not from a hash of the whole
  Markdown content.
- Lowering the starting `alpha` alone is not accepted as a fix.
- The new tunables (position tolerance, neighborhood size, anchor stiffness,
  movement threshold) are defined in one place next to the existing layout
  constants in `layout/projections.ts`, each documented with meaning, unit and
  default, and not duplicated at call sites.
- The debounce intervals of 800 ms and 400 ms stay as they are.

## Deferred

- **Layout in a worker.** Removing unnecessary work comes first. Reconsider when
  explicit rearrangements of large vaults remain too slow after Block 7.
- **Incremental similarity matrix (recompute only changed rows).** After Block 2
  the matrix is only rebuilt on real changes; whether partial updates are worth
  the complexity is decided based on measurements after Block 6.
  Measured after Block 6 (synthetic data, 1024 dimensions): an unchanged update
  takes about 5 ms for 2000 notes; a change to one note runs a bounded
  adjustment that moves 6 nodes in about 0.04 s for 300, 0.4 s for 1000 and
  1.7 s for 2000 notes. That time is dominated by the full similarity matrix
  rebuild, so updating only the changed rows is the next lever for large
  vaults.
