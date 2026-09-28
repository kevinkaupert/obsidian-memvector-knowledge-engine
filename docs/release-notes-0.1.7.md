# Release 0.1.7 — Custom Relations, Grounded GraphRAG Prompt Context & Scatterplot Rendering Hardening

> **Release Version:** `0.1.7`  
> **Release Date:** `2026-09-28`  
> **Target Obsidian Version:** `>= 1.11.4` (Desktop)  
> **Assets:** `main.js`, `manifest.json`, `styles.css`

---

## Overview

Release `0.1.7` expands the MemVector Knowledge Engine with custom domain relation types and presets whose 2D layout forces are editable data rather than code, injects typed knowledge relation edges directly into GraphRAG synthesis prompts, introduces granular seed pinning and context dismissal controls in the toolbar preview, eliminates hidden graph enrichment quotas, slims the floating 2D toolbar down to what belongs on the canvas while moving the rest into plugin Settings, and resolves visual and GPU-compositing glitches in the 2D scatter view.

See **Upgrade notes** below for the two visible behavior changes: relation notes are now hidden on the canvas by default, and lasso selection is the `Shift` + drag gesture only.

---

## Highlights

- **Custom Edge Types & Presets (#119, PR #121):**
  Define relation types beyond the 13 canonical vocabulary terms, keep them in domain presets
  (`wiki/presets/`: STEM, Law, Medicine, Philosophy), and tune each type's 2D force directly:
  the **Relation types** section in Settings edits `weight` and `repels` per label in place.
  Layout semantics are vocabulary data now, not code (`docs/adr/0002-vocabulary-driven-layout-weights.md`).
- **Typed Relation Edges in GraphRAG Prompt Context (#104, PR #128):**
  LLM synthesis prompts now include an explicit knowledge relations block formatted with WikiLinks and relation directions (e.g. `- [[Note A]] --[CONFLICTS_WITH]--> [[Note B]] (Reason: ...)`). The AI co-pilot reasons directly over verified structural connections rather than treating context as flat bags of words.
- **Context Preview Pinning & Note Dismissal (#116, #117, PR #123, PR #124, PR #126):**
  Selected seed notes are now pinned at the top of the live context preview under an explicit header. Users can review automatically retrieved vector and multi-hop graph candidates and manually dismiss unwanted notes (`x`) before starting synthesis. The floating toolbar is widened to 280px with right-aligned dismiss controls.
- **Slimmed 2D Toolbar, Controls Moved into Settings (#119, PR #121):**
  Relation edges are always rendered and the toolbar keeps only the hop radius. Visual style,
  relation-note visibility and agent guidelines live in plugin Settings and now apply to an open
  view immediately. Lasso selection is the `Shift` + drag gesture; its toolbar toggle is gone.
  Relation *notes* are hidden by default, so the canvas reads as typed connections between
  concepts rather than as relation files.
- **Transparent Graph Context Quotas (#115, PR #122):**
  Removed hidden internal SQL query caps (`perHop * 3 + seeds`) and arbitrary slack multipliers from graph enrichment queries. Neighbor retrieval now strictly follows user-configured settings without silently dropping or overfetching notes across multi-hop queries.
- **Scatterplot Label Decluttering (PR #130):**
  Greedy screen-space collision avoidance (`labelPlacement.ts`) over a uniform grid. Cluster labels
  anchor first, then selected/hovered/connected node labels reserve their space, then everyone else
  yields - so the label you are looking at is never overdrawn by a neighbor's.
- **GPU-Compositing Glitch Elimination (PR #130):**
  Resolved an Electron/Chromium compositor bug on macOS that caused stale canvas text to bleed into unrelated Obsidian panes (file explorer sidebar, tab bar). Removed `backdrop-filter: blur` from the floating toolbar and throttled trackpad/mouse redraw triggers to at most one per animation frame via `window.requestAnimationFrame`.
- **Complete Toolbar & Sidebar Localization (#111, PR #127):**
  Migrated the remaining hardcoded UI strings, buttons, tooltips and badges into the i18n system
  across German and English, down to the synthesis status line, the context preview's hop wording
  and the model-reasoning callout.

---

## Upgrade notes

- A vault that already has `wiki/relation-types.json` from an earlier version keeps its layout
  behavior: terms written before `weight`/`repels` existed inherit the bundled per-label semantics
  instead of collapsing to the generic `1.0` attraction. No manual migration or re-index is needed.
- Relation notes are hidden on the canvas by default from this version on. Re-enable them under
  **Settings -> Show relation notes**; the typed edges between concept notes are shown either way.
- The **Lasso** toolbar toggle is gone. Hold `Shift` and drag to lasso-select.

---

## Changelog

### Added
- Custom relation edge types, presets, and vocabulary-driven layout weights (#119, PR #121).
- Bundled domain presets under `wiki/presets/` (STEM, Law, Medicine, Philosophy) with a Settings **Relation types** manager: preset switch/create/rename/delete, a per-label type table with in-place `weight`/`repels` editing, add/remove, and reset to the STEM default (#119, PR #121).
- Typed knowledge relation edges injected directly into GraphRAG LLM prompt context (#104, PR #128).
- Sticky seed notes pinned at the top of the context preview (#117, PR #123).
- Manual dismissal controls (`x`) on context preview items allowing users to prune unwanted vector or graph notes before launching LLM synthesis (#116, PR #124, PR #126).
- Greedy screen-space collision avoidance (`labelPlacement.ts`) for 2D scatter plot to declutter dense cluster and node labels (PR #130).
- Setting **Show relation notes** (`showRelationNotes`, default `false`) replacing the former toolbar toggle (#119, PR #121).
- CI step verifying that the committed `main.js` bundle matches the current source, so a source change cannot ship with a stale artifact.

### Changed
- Removed hidden internal SQL neighbor caps and slack multipliers from graph traversal queries, strictly honoring user-configured hop limits and context budgets (#115, PR #122).
- Widened floating toolbar to 280px and pinned context preview dismiss buttons to the far right for clean alignment and usability (PR #126).
- Slimmed the floating 2D toolbar: relation edges are always rendered and the toolbar keeps only the hop radius. The **Lasso**, **Show edges**, **Show relation notes**, **Visual style** and **Agent guidelines** toggles were removed from it; visual style, relation-note visibility and agent guidelines moved into plugin Settings, and lasso selection is now the `Shift` + drag gesture only (#119, PR #121).
- Relation edges are shown by default (`showEdges`), relation *notes* are hidden by default (`showRelationNotes`) - the graph now reads as typed connections between concept notes rather than as relation files on the canvas (#119, PR #121).
- Settings sections reordered to match their numbering; the relation vocabulary path field moved into the collapsible **Relation types** section (#119, PR #121).
- Bundled relation vocabulary slimmed from 37 conversational synonym entries to exactly one entry per canonical label (13). The dropdown selects canonical labels, so existing relation files and edges are unaffected; the work-in-progress `buildConversationalCategories` scaffolding for Issue #43 was removed with it (#119, PR #121).
- Visual style, relation-note visibility and label opacity now take effect immediately in an open 2D view, and every relation-vocabulary change (type add/remove, weight/repels edit, reset, preset switch) re-runs the force layout there, instead of requiring the view to be reopened.
- Relation prompt heading and reason label now come solely from the i18n layer; the duplicated inline copies in `synthesis.ts` were removed.

### Fixed
- Eliminated GPU compositing artifacts / text bleeding into unrelated Obsidian panes (tab bar, file explorer) on macOS by removing toolbar `backdrop-filter: blur` and throttling canvas redraws via `requestAnimationFrame` (PR #130).
- Fixed remaining hardcoded UI strings in toolbar and sidebar views by routing them through the i18n layer (#111, PR #127).
- Preserve bundled per-label layout semantics (`weight`/`repels`, ADR-0002) for vocabulary files written before those fields existed and for labels missing from the active preset, instead of silently collapsing every label to the generic `1.0` attraction - which turned `CONFLICTS_WITH` from repulsion into attraction and `INDEPENDENT_OF` from the neutral `0.05` baseline into a full pull, re-breaking #68 (`relationVocabulary/layoutDefaults.ts`).
- Bidirectional relations saved from the Relation Builder now store a reverse edge row like the full re-index path, so reverse-hop traversal works without a manual re-index (#120, PR #121).
- Skip non-finite vector similarity scores during GraphRAG context enrichment instead of admitting them as matches (PR #127).
- Correct `isRelationNode` path matching so sibling folders such as `wiki/relations-archive/` are no longer misclassified as relation notes (PR #127).
- Scope the canvas redraw throttle to `window.requestAnimationFrame` and cancel the pending frame in the interaction teardown, so the 2D view keeps redrawing in an Obsidian popout window and a scheduled frame cannot fire after the view closed (PR #130).
- Selected, hovered and connected node labels now reserve their space before all other labels, so the label the user is focused on is no longer overdrawn by an arbitrary neighbor's (PR #130).
- Long note titles in the context preview now ellipsize instead of pushing the meta column and dismiss button out of the toolbar panel.
- The context preview reset button stays reachable when context enrichment fails, so dismissed notes can always be restored.
- Removed the orphaned translation keys left behind by the toolbar slimming (`lblLasso`, `lblShowEdges`, `lblVisualStyle`) and wired up the two that were added but never used (`synthRelHeading`, `synthRelReasonLabel`).
- Routed the last hardcoded strings in the synthesis path through i18n: the context-search status line, the context preview's hop wording, and the model-reasoning callout title.

### Performance
- Label collision detection uses a uniform screen-space grid instead of a linear scan over every placed rect, so dense vaults no longer pay a quadratic cost on each animation frame during pan and zoom (PR #130).

### Documentation
- `ADR-0002`: vocabulary-driven layout weights, including the bundled-default fallback and the in-place weight/repels editing (`docs/adr/0002-vocabulary-driven-layout-weights.md`).
- Audit of the 0.1.6 -> 0.1.7 commit range against its own claims (`docs/audits/0.1.7-release-audit.md`).
- Updated `README.md` (version and test badges, per-type force editing, lasso gesture), `docs/ARCHITECTURE.md` (vocabulary-driven weights, lasso gesture, legacy graph-backend wording), `docs/USER_GUIDE.md` and `docs/CONFIGURATION.md`.

---

## Installation & Upgrade

### Community Plugins (Automatic)

Search for **MemVector Knowledge Engine** in Obsidian Community Plugins and click **Update** (or **Install**).

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the release assets on GitHub.
2. Copy all three files into your vault's plugin directory:
   `<vault>/.obsidian/plugins/obsidian-memvector-knowledge-engine/`
3. Reload Obsidian or toggle the plugin off and on under **Settings → Community Plugins**.
