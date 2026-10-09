# 0004 - Unified vector calculation pipeline

Status: Implemented
Date: 2026-10-09
Issues: #232 (two diverging pipelines), #230 (partial outcomes only surfaced in Settings)

## Goal

"Index vault locally now" (Settings) and "Calculate vectors" (2D view toolbar) run the same pipeline, so they give
the same guarantees for error tolerance, persistence and reconciliation. The entry points differ only in which notes
they embed and how they report progress and outcome.

## Starting point

| Aspect | Settings (`syncVaultVectors`) | Toolbar (`calcAndPersistVectors`) |
|---|---|---|
| Embedding error | skips the note; aborts after 3 consecutive errors or when the first request fails | stops at the first error |
| Partial outcome | reported as `[WARN]` (#230) | stops early, no partial report |
| Reconcile | always, against the indexable vault | only if every note succeeded |
| Unreadable stored hashes | run fails | logged, run continues without cache |
| Empty note | skipped, no vector | embedded (file name only) |
| `mtime` / payload title | `mtime` set, title = file name | no `mtime`, title = node title |
| Vectors for the view | not needed | fresh + cached vectors returned |

## Decisions

1. **One pipeline in `src/sync/vectorPipeline.ts`.** It takes the note paths to embed and the paths to reconcile
   against, and returns counts, failed paths and (on request) the vectors per path. Progress and per-note errors are
   reported through callbacks. Entry points keep their own UI wording.
2. **Error tolerance from Settings.** A failed note is skipped and recorded. The run aborts after 3 consecutive
   errors, or when the first embedding request of the run fails (wrong endpoint or model). On abort the vectors
   calculated so far are still written, reconcile is skipped, and the error carries the partial result.
3. **Reconcile always runs after a non-aborted run**, against the whole indexable vault. Failed notes are in that
   list, so their previous vectors are kept. The toolbar keeps reconciling against the vault, not the filtered view.
4. **Unreadable stored hashes or vectors are logged** and the run continues without cache, as the toolbar did. A
   broken store still fails on the write that follows.
5. **Empty notes are embedded** from their file name, as the toolbar did. The embedding text already contains the
   file name, so the hash is stable and both entry points stay cache-compatible.
6. **Rows carry `mtime` and the file name as title** from both entry points.
7. **A change of the embedding target mid-run throws `EmbeddingTargetChangedError` before anything is written**;
   both entry points report it as cancelled.
8. **Persistence failures throw `VectorPersistenceError`**, so the toolbar can keep its distinct storage error status.

## Steps

1. Add the pipeline with its own tests (tolerance, abort with partial write, reconcile, target change, persistence
   error, cache with and without stored vectors).
2. Reduce `syncVaultVectors` to a wrapper over the pipeline.
3. Rebuild the toolbar run on the pipeline; report partial outcomes as `[WARN]`.
4. Adjust tests that encoded the old divergent behavior; keep every other toolbar and sync test passing unchanged.

## Deferred

- Position reconciliation (`reconcileNodePositionsWithVault`) stays with the callers: it belongs to the 2D map, not
  to the vector store, and both callers already run it.
