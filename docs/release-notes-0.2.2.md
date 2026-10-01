# Release 0.2.2 — Stable 2D Layout, Event-Driven Updates & Data Safety Fixes

> **Release Version:** `0.2.2`  
> **Release Date:** `2026-10-01`  
> **Target Obsidian Version:** `>= 1.11.4` (Desktop)  
> **Assets:** `main.js`, `manifest.json`, `styles.css`

---

## Overview

Release `0.2.2` makes the 2D view keep its map. Data updates no longer re-run the whole force simulation: nothing is computed when nothing that affects the layout changed, a relevant change moves only the affected notes, and a full rearrangement is an explicit action. Background views stop computing, and positions are written only when they actually moved.

It also fixes a set of data safety issues: indexing runs are cancelled when the embedding model changes mid-run, incomplete relation notes no longer delete stored edges, a failed vector read no longer rearranges the map on fallback data, synthesis context no longer contains text a note no longer has, and positions of deleted notes are cleaned up.

**Correction to 0.2.1:** the 0.2.1 release notes described "full spatial mental map continuity across vault restarts". In 0.2.1, stored positions were restored but only used as starting values: every update re-ran the full simulation, which moved every node and kept shuffling the map. 0.2.2 keeps stored positions unchanged on reopen and for unchanged layout inputs.

The automated test suite grows to 720 tests across 64 test files, all passing.

---

## Highlights

### 1. The layout only changes when something relevant changed (ADR-0006, supersedes ADR-0005)
- **No work for irrelevant edits**: the view compares signatures of what the layout actually reads - per note the folder, links, formulas (math domain), the words of the first 800 characters and the vector; globally the relation forces, spacing, knowledge domain and "WikiLinks as relations". Typing further down in a note, editing a title or changing a relation's description moves nothing and writes nothing (#206, #209).
- **Restart keeps the map**: reopening the view or restarting Obsidian shows the stored positions unchanged, without running the simulation.
- **Local adjustment for real changes**: a changed, new or re-linked note moves together with its relation neighbors and its five most similar notes only. All other notes stay exactly where they are. The adjustment starts with low energy, keeps moved notes close to their previous position and stops once nothing moves (#185).
- **Explicit placement status**: a note that sits exactly at the center of the map is stored and restored like any other instead of being treated as unplaced (#190).
- **Larger changes still re-layout**: vectors recalculated for most notes, a changed knowledge domain, "WikiLinks as relations" or a moved spacing slider still recalculate the whole layout.

Measured on synthetic data (1024-dimensional vectors, layout step only): an update without a relevant change takes about 5 ms for 2000 notes instead of a full pass of several seconds; a change to one note moves about 6 notes and takes about 0.4 s for 1000 and 1.7 s for 2000 notes.

### 2. Event-driven updates
- **One event queue per view**: repeated saves of a note are coalesced, and a change re-reads only that note instead of the whole vault (#210).
- **Irrelevant events are ignored**: notes excluded from indexing or outside the view filter no longer trigger work. Relation notes and the vocabulary file are still processed, because they change forces between visible notes.
- **Ordered updates**: an older scan can no longer overwrite a newer one.
- **Hidden views wait**: a view in a background tab collects note and settings changes and applies them once when it is shown again. Views in split panes and popout windows update live (#212).
- **Fewer database writes**: positions are written only for notes that moved, batched over one second, and flushed when the view closes. A failed write is retried with the next one (#211).

### 3. "Rearrange layout"
- Since data updates no longer rearrange the map, a fresh global layout is now an explicit action: the **"Layout neu anordnen" / "Rearrange layout"** button in the view section of the toolbar, under the spacing sliders, and the command **"MemVector: Rearrange 2D layout"** (#214).

### 4. Data safety
- **Model switch during indexing**: "Calculate vectors" and "Index vault locally now" are cancelled when the embedding model or endpoint changes while they run. Their vectors are neither shown nor stored, so vectors of the new model are not overwritten (#202).
- **Incomplete relation notes**: a relation note without a usable source or target link no longer causes its stored edge to be deleted during graph sync; the note is logged with its path (#203).
- **Failed vector read**: when stored vectors cannot be read, the map is kept as it is - no layout run, no position write - and a notice explains it. In-memory vectors are only used as fallback when they belong to the current model. The first update that can read the vectors again resumes normal updates (#191).
- **Fresh synthesis context**: context from vector search uses the note as it is now, also when it was emptied, instead of the excerpt stored at embedding time (#196).
- **Position cleanup**: positions of deleted notes and of notes excluded from indexing are removed by "Index vault locally now" and by a complete "Calculate vectors" run. Notes only hidden by a view filter or relation-note visibility keep their position (#196).

### 5. Settings reach open views
- **Relation notes toggle**: turning "show relation notes" on shows them immediately instead of after the next unrelated rescan (#204).
- **Exclusions, knowledge domain, WikiLinks as relations**: changing them in Settings updates open views right away (#189).
- **Spacing across views**: moving a spacing slider in one view applies to every open view (#189).

---

## Changelog

### Added
- "Rearrange layout" button in the view section and command "MemVector: Rearrange 2D layout" (#214).
- `--delay <ms>` option for `testing/mock-echo-server.js`, to test cancelling indexing on a model switch.

### Fixed
- Layout runs and position writes for edits that do not affect the layout (#206, #209).
- Map drift: every update re-ran and re-heated the full simulation (#185).
- Full-vault rescans on every note change; events for excluded or filtered notes; overlapping scans (#210).
- Position writes for unmoved notes and full database exports after every pass (#211).
- Computation in hidden views (#212).
- Nodes at exactly `(0, 0)` treated as unplaced (#190).
- Relation notes toggle without effect until another rescan (#204).
- Incomplete relation notes deleting stored edges (#203).
- Indexing adopting or storing previous-model vectors after a model switch mid-run (#202).
- Layout and position writes on fallback data after a failed vector read (#191).
- Stale stored excerpt used as context for emptied notes; orphaned positions never removed (#196).
- Exclusions, knowledge domain, WikiLinks as relations and spacing not reaching open views (#189).

### Changed
- ADR-0006 supersedes ADR-0005: positions are kept for unchanged layout inputs, relevant changes lead to a bounded adjustment, a full rearrangement is an explicit action.
- Documentation describes when the layout changes (`docs/USER_GUIDE.md`, `docs/CONFIGURATION.md`, `docs/ARCHITECTURE.md`).

---

## Upgrade Notes

- **The map no longer rearranges on its own.** If the arrangement no longer fits after many changes, use "Layout neu anordnen" / "Rearrange layout".
- **Run "Index vault locally now" once** after updating to remove stored positions of notes that were deleted before this release.

---

## Installation & Upgrade

### Community Plugins (Automatic)
Search for **MemVector Knowledge Engine** in Obsidian Community Plugins and click **Update** (or **Install**).

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the release assets on GitHub.
2. Copy all three files into your vault's plugin directory:
   `<vault>/.obsidian/plugins/memvector-knowledge-engine/`
3. Reload Obsidian or toggle the plugin off and on under Settings → Community Plugins.
