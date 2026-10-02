# Release 0.2.3 — Layout Stability, Retrieval Hardening & Determinism

> **Release Version:** `0.2.3`  
> **Release Date:** `2026-10-02`  
> **Target Obsidian Version:** `>= 1.11.4` (Desktop)  
> **Assets:** `main.js`, `manifest.json`, `styles.css`

---

## Overview

Release `0.2.3` delivers comprehensive hardening across 2D vector scatter layout stability, camera bounds tracking, retrieval channel error handling, radar unindexed heuristics, and cross-platform deterministic sorting.

It addresses vectorless note edge cases where un-embedded notes previously distorted rescale bounds or collapsed onto the origin, guarantees that deleting relations triggers a clean scratch rearrangement with automatic camera refitting, centrally prunes deleted notes before all layout passes, surfaces unindexed SQLite graph database states with localized UI warnings, and standardizes all string comparisons to explicit `"en"` locale ordering.

The automated test suite grows to 775 tests across 68 test files, all passing.

---

## Highlights

### 1. Vector Scatter Layout Integrity (#224)
- **Protected Rescale Bounds**: `rescaleSimilarityMatrix` now derives similarity bounds strictly from pairs of notes with valid embeddings when >= 2 exist, preventing un-embedded notes from distorting global matrix scaling or causing notes to collapse onto the origin. When 0 or 1 embedded note exists, bounds default safely without injecting artificial zero-similarity pairs.
- **Embedded Centroid Preference**: Cluster centroid selection (`assignClusters`) now explicitly prefers notes with genuine vector embeddings even for small note counts (n <= numClouds), preventing un-embedded notes from anchoring clusters.
- **Deterministic Sort Tiebreaks**: In `layoutEngine.mobileSet`, note ID comparison serves as an explicit tiebreak when similarity scores match.
- **Centralized Deleted-Note Pruning**: Added `pruneDeletedNodes()`, executed systematically prior to `applyLayout()`, `rearrangeLayout()`, `onVectorsCalculated()`, `reloadEmbeddings()`, and `refreshRelationEdges()`, preventing deleted notes from remaining as ghost nodes.

### 2. Camera Refitting on Relation Removal (#218)
- **Viewport Tracking on Edge Deletion**: Removing a relation in the relation builder executes a deterministic global rearrangement. The camera now automatically calls `fitToView()` with viewport adjustment tracking (`hasFittedView`), ensuring the rearranged graph remains centered and never drifts out of the visible pane.
- **ADR-0006 Documentation Clarification**: Updated ADR-0006 to accurately describe that removing a relation computes a canonical scratch layout rather than preserving evolved local positions, while un-embedded notes participate in repulsion and text-based link forces without hijacking rescale bounds.

### 3. Retrieval Channel Status & Radar Fallback (#192, #193)
- **Graph Retrieval Unindexed State**: The SQLite graph store now exposes an `isIndexed()` check. When the graph has not yet been synced, context enrichment marks the channel as `unindexed` instead of falsely reporting `ready`, and surfaces the localized warning `retrievalGraphUnindexed` in context previews and synthesis results.
- **Consistent Radar Fallback**: When an active note has no vector neighbors but candidate markdown files exist in the vault, radar returns `{ status: "unindexed", data: [] }`, transparently falling back to word/formula heuristic ranking (`rankCandidates`) and displaying the `radarUnindexed` warning banner.
- **Degraded Channel Resilience**: Previews and synthesis gracefully handle individual channel failures or unindexed states while preserving valid context from operational channels.

### 4. Reasoning Token Preservation & Provider Resilience (#198, #200)
- **Truncated Reasoning Recovery**: Incomplete reasoning blocks lacking a closing `</think>` tag are retained and displayed within the collapsible callout rather than discarded or crashing parsing. Empty response bodies trigger clear errors.
- **Workspace State Restoration**: Saved scatter filters are restored smoothly on startup without redundant re-scans (#194).

### 5. Cross-Machine Determinism (#195)
- **Explicit Locale Ordering**: Standardized all string comparisons, path orderings, and SQLite search tiebreaks across the codebase to `localeCompare(..., "en")`, eliminating machine-dependent sorting variances across platforms and locales.

---

## Changelog

### Fixed
- Vectorless notes distorting similarity rescale bounds and collapsing to origin stacks (#224).
- Rescale bounds computation failing when 0 or 1 embedded note exists.
- Centroid selection choosing un-embedded notes as cluster anchors for note sets where n <= numClouds.
- Missing camera refit (`fitToView`) after deleting relations in `refreshRelationEdges`.
- Deleted notes lingering across layout passes (`rearrangeLayout`, `onVectorsCalculated`, `reloadEmbeddings`, spacing sliders).
- Graph store falsely reporting `ready` when graph database was never indexed.
- Radar reporting `ready` instead of `unindexed` when active note has embeddings but vault neighbors are unindexed.
- Platform- and locale-dependent sorting discrepancies across systems.
- Incomplete reasoning blocks failing to parse or dropping thinking tokens (#198).
- Redundant vault rescans when restoring saved workspace scatter filters (#194).

### Changed
- Standardized all `localeCompare` calls to explicit `"en"` locale.
- ADR-0006 updated to clarify scratch global rearrangement upon relation deletion and hybrid force modeling.
- Added localized `retrievalGraphUnindexed` warning for unindexed graph database in English and German.

---

## Upgrade Notes

- **Camera Auto-Fit**: Deleting a relation now automatically refocuses the camera view on the resulting node layout.
- **Graph Status**: If you see a warning indicating the graph database is unindexed, run **"Jetzt Vault lokal indizieren" / "Index vault locally now"** in Settings -> MemVector.

---

## Installation & Upgrade

### Community Plugins (Automatic)
Search for **MemVector Knowledge Engine** in Obsidian Community Plugins and click **Update** (or **Install**).

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the release assets on GitHub.
2. Copy all three files into your vault's plugin directory:
   `<vault>/.obsidian/plugins/memvector-knowledge-engine/`
3. Reload Obsidian or toggle the plugin off and on under Settings → Community Plugins.
