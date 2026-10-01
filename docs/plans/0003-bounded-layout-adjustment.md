# 0003 - Bounded layout adjustment and event-driven recomputation

Status: Planned
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
address #206, blocks 6 and 7 address #185 and #190.

### Block 1 - acceptance test and instrumentation (#208)

- Add a test harness that runs the view's scan and layout path with the real
  `applyVectorLayout` (not mocked) on a small fixture vault.
- Count simulation runs and position writes through injectable hooks, so tests
  can assert "zero runs, zero writes".
- Add the acceptance test from ADR-0006 as a failing test: repeated `modify`
  events on a note without a layout-relevant change cause zero simulation runs,
  zero position writes and zero coordinate changes. It turns green in Block 2.

### Block 2 - layout-input signatures and skipping unchanged passes (#209)

- Build the prepared layout inputs per note once per scan: identity, folder,
  link targets, word and formula features of the excerpt, type, title, and the
  vector together with its embedding fingerprint.
- Derive a per-note signature from these prepared inputs, and a global
  signature from relation edges (endpoints, type weight, attraction or
  repulsion, direction), vocabulary weights and spacing settings.
- `applyLayout` compares against the signatures of the last completed pass. If
  nothing changed: no matrix, no cluster assignment, no simulation, no write.
- Spacing sliders keep triggering a pass, since they change a global input.

### Block 3 - event queue and selective reads (#210)

- Replace the separate debounced paths with one queue per view. Events for the
  same file are coalesced; the debounce intervals stay (800 ms for notes,
  400 ms for relation notes).
- `modify` re-reads only the changed file and updates its node in place;
  `create`, `delete` and `rename` update the node set. A full scan remains for
  the initial open and for recovery (e.g. a failed incremental update).
- Ignore events for notes excluded from indexing or outside the view filter.
- A relation note edit only reaches the layout when its effective-force
  signature changed; a description-only edit updates data and redraws.
- Every scan carries a generation number; the result of an older scan is
  discarded when a newer one has started. The relation-notes toggle enqueues
  its scan instead of starting one directly.

### Block 4 - persistence only for moved positions (#211)

- Keep the last successfully persisted coordinates in memory.
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

### Block 7 - explicit rearrangement and documentation

- Add a "Rearrange" action that runs a free global layout and recomputes the
  normalization bounds and clusters. Its placement in the view is shown as an
  ASCII mock-up and agreed before implementation.
- A new vector set (model switch, re-index) also allows a larger layout run.
- Update `docs/USER_GUIDE.md`, `docs/CONFIGURATION.md` and `docs/ARCHITECTURE.md`
  to describe when the layout changes.

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
