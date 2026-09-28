# Release 0.1.7 — Custom Relations, Grounded GraphRAG Prompt Context & Scatterplot Rendering Hardening

> **Release Version:** `0.1.7`  
> **Release Date:** `2026-09-28`  
> **Target Obsidian Version:** `>= 1.11.4` (Desktop)  
> **Assets:** `main.js`, `manifest.json`, `styles.css`

---

## Overview

Release `0.1.7` expands the MemVector Knowledge Engine with custom domain relation types and presets, injects typed Memgraph relation edges directly into GraphRAG synthesis prompts, introduces granular seed pinning and context dismissal controls in the toolbar preview, eliminates hidden graph enrichment quotas, and resolves visual and GPU-compositing glitches in the 2D scatter view.

---

## Highlights

- **Custom Edge Types & Presets (#119, PR #121):**
  Users can now define custom relation types beyond the 13 canonical vocabulary terms, save them into domain presets, and benefit from vocabulary-driven layout attraction weights in the 2D force simulation.
- **Typed Relation Edges in GraphRAG Prompt Context (#104, PR #128):**
  LLM synthesis prompts now include an explicit knowledge relations block formatted with WikiLinks and relation directions (e.g. `- [[Note A]] --[CONTRADICTS]--> [[Note B]] (Reason: ...)`). The AI co-pilot reasons directly over verified structural connections rather than treating context as flat bags of words.
- **Context Preview Pinning & Note Dismissal (#116, #117, PR #123, PR #124, PR #126):**
  Selected seed notes are now pinned at the top of the live context preview under an explicit header. Users can review automatically retrieved vector and multi-hop graph candidates and manually dismiss unwanted notes (`x`) before starting synthesis. The floating toolbar is widened to 280px with right-aligned dismiss controls.
- **Transparent Graph Context Quotas (#115, PR #122):**
  Removed hidden internal SQL query caps (`maxNeighbors * 3`) and arbitrary slack multipliers from graph enrichment queries. Neighbor retrieval now strictly follows user-configured settings without silently dropping or overfetching notes across multi-hop queries.
- **Scatterplot Label Decluttering (PR #130):**
  Introduced greedy screen-space rectangle collision avoidance (`labelPlacement.ts`). Cluster labels anchor first, while node labels render cleanly without overlapping in dense clusters. Active, hovered, and tallied notes remain prioritized and always visible.
- **GPU-Compositing Glitch Elimination (PR #130):**
  Resolved an Electron/Chromium compositor bug on macOS that caused stale canvas text to bleed into unrelated Obsidian panes (file explorer sidebar, tab bar). Removed `backdrop-filter: blur` from the floating toolbar and throttled trackpad/mouse redraw triggers to at most one per animation frame via `requestAnimationFrame`.
- **Complete Toolbar & Sidebar Localization (#111, PR #127):**
  Fully migrated remaining hardcoded UI strings, buttons, tooltips, and badges in the toolbar and sidebar into the i18n translation system across German and English.

---

## Changelog

### Added

- Custom relation edge types, presets, and vocabulary-driven layout weights (#119, PR #121).
- Typed Memgraph relation edges injected directly into GraphRAG LLM prompt context (#104, PR #128).
- Sticky seed notes pinned at the top of the context preview (#117, PR #123).
- Manual dismissal controls (`x`) on context preview items allowing users to prune unwanted vector or graph notes before launching LLM synthesis (#116, PR #124, PR #126).
- Greedy screen-space collision avoidance (`labelPlacement.ts`) for 2D scatter plot to declutter dense cluster and node labels (PR #130).

### Changed

- Removed hidden internal SQL neighbor caps and slack multipliers from graph traversal queries, strictly honoring user-configured hop limits and context budgets (#115, PR #122).
- Widened floating toolbar to 280px and pinned context preview dismiss buttons to the far right for clean alignment and usability (PR #126).

### Fixed

- Eliminated GPU compositing artifacts / text bleeding into unrelated Obsidian panes (tab bar, file explorer) on macOS by removing toolbar `backdrop-filter: blur` and throttling canvas redraws via `requestAnimationFrame` (PR #130).
- Fixed remaining hardcoded UI strings in toolbar and sidebar views by routing them through the i18n layer (#111, PR #127).

---

## Installation & Upgrade

### Community Plugins (Automatic)

Search for **MemVector Knowledge Engine** in Obsidian Community Plugins and click **Update** (or **Install**).

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the release assets on GitHub.
2. Copy all three files into your vault's plugin directory:
   `<vault>/.obsidian/plugins/obsidian-memvector-knowledge-engine/`
3. Reload Obsidian or toggle the plugin off and on under **Settings → Community Plugins**.
