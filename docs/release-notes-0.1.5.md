# Release 0.1.5 — Data Safety Hardening, Force Layout Optimizations & Semantic Palettes

> **Release Version:** `0.1.5`  
> **Release Date:** `2026-09-23`  
> **Target Obsidian Version:** `>= 1.11.4` (Desktop)  
> **Assets:** `main.js`, `manifest.json`, `styles.css`

---

## Overview

Release `0.1.5` is a comprehensive stability, performance, and data safety release addressing findings from the deep codebase audit.

This release eliminates potential data loss during relation editing, prevents relation file slug collisions via SHA-256 identity hashing, optimizes the continuous 2D force simulation loop by removing redundant calculations and string allocations, enforces strict note exclusions across GraphRAG synthesis, introduces dedicated semantic colors for all 13 canonical relation types across light and dark themes, and expands the automated test suite to 247 tests across 31 test files.

---

## Highlights

- **Atomic Relation Save Flow & Overwrite Guards:** Resolved a critical lost-update risk in `RelationBuilderModal`. Replacement relation notes and graph edges are now written and verified before previous files are cleaned up, duplicate targets in batch creations are rejected upfront, and target files cannot overwrite existing relations (#73).
- **Injective Relation Slugs via Identity Suffixes:** Added SHA-256 identity suffixes (`${baseSlug}-${hash.slice(0, 6)}`) to bounded relation filenames. This guarantees notes with punctuation or similar folder structures remain distinct without collisions, while retaining legacy path lookup for backwards compatibility (#74).
- **Strict GraphRAG Context Exclusions:** Enforced path and file exclusion patterns during GraphRAG context enrichment. Excluded notes and non-concept auxiliary files are strictly filtered out before neighbor scoring and prompt synthesis, preventing unwanted notes from leaking into LLM context (#82).
- **2D Force Layout Simulation Optimizations:**
  - Removed redundant similarity matrix rescaling inside the force projection loop, preserving single-ownership and caller-provided affinities (#75).
  - Precomputed note token sets in $O(N)$ upfront, eliminating $O(N^2)$ pairwise re-tokenization and inner-loop string allocations during force simulation (#80).
  - Modeled `INDEPENDENT_OF` relation edges as neutral baseline graph weight (0.05) rather than strong attraction, keeping logically independent notes organically decoupled (#68).
- **Semantic Relation Palette across Ink & Muted Canvas Modes:** Added distinct, dedicated semantic colors for all 13 canonical Cypher relation labels (`IMPLIES`, `REQUIRES`, `EQUIVALENT_TO`, `CONFLICTS_WITH`, `INDEPENDENT_OF`, etc.) across both default "ink" and "muted" visual themes, with dynamic hash fallback for custom domain types (#62).
- **Relation Direction Resolution & Vocabulary Alignment:** Fixed `resolveEdgesForSave` to strictly honor `reversed: true` definitions across both conversational keys and canonical labels, correctly preserving `originalTerm` and aligning architecture and configuration documentation (#70).
- **Expanded Test Suite (247 Passing Tests):** Added 71 new automated unit and adversarial tests covering batch edge conflicts, slug identity invariance, graph topology weights, simulation scaling, and relation vocabulary resolution (#67, #70, #73, #74, #75, #80, #82).

---

## Changelog

### Fixed
- Honor reversed direction and accurate `originalTerm` resolution for relation definitions in save pipeline, and align vocabulary documentation (#70).
- Treat `INDEPENDENT_OF` relations as neutral baseline graph weight instead of strong attraction in 2D force layout (#68).
- Precompute note token sets in $O(N)$ instead of $O(N^2)$ pairwise re-tokenization, and eliminate inner-loop string allocations during 2D force layout (#80).
- Eliminate redundant similarity matrix rescaling inside 2D force layout projection, preserving single-ownership and caller-provided affinities (#75).
- Add SHA-256 identity suffixes to bounded relation filenames to distinguish folder/punctuation collisions, while preserving legacy paths for edits and duplicate detection (#74).
- Save replacement relation files and graph edges before deleting previous data; reject duplicate batch targets and prevent create races from overwriting other relations (#73).
- Enforce exclusion rules in GraphRAG context enrichment, preventing excluded notes from polluting prompt context (#82).
- Render distinct, semantic palette colors for relation types in 2D scatter plot across default ("ink") and "muted" visual styles, with dedicated colors for all 13 canonical Cypher relation labels (#62).

### Documentation
- Document canonical Cypher relation labels in active dropdown and conversational phrase mapping in `buildConversationalCategories` as planned Issue #43 expansion (#70).
- Correct unsubstantiated 15x math weighting claim, align layout force equations and initial PCA placement descriptions with implementation, fix custom endpoint defaults and setting section order, and update version and test count badges (#67, #68, #71).

---

## Installation & Upgrade

### Community Plugins (Automatic)

Search for **MemVector Knowledge Engine** in Obsidian Community Plugins and click **Update** (or **Install**).

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the release assets on GitHub.
2. Copy all three files into your vault's plugin directory:
   `<vault>/.obsidian/plugins/memvector-knowledge-engine/`
3. Reload Obsidian or toggle the plugin off and on under **Settings → Community Plugins**.
