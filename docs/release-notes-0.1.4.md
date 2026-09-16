# Release 0.1.4 — Organic 2D Manifold Layout, Canonical Relations & Full Audit Resolution

> **Release Version:** `0.1.4`  
> **Release Date:** `2026-09-16`  
> **Target Obsidian Version:** `>= 1.11.4` (Desktop)  
> **Assets:** `main.js`, `manifest.json`, `styles.css`

---

## Overview

Release `0.1.4` is a major milestone that pairs an entirely rewritten, organic 2D vector canvas experience with the complete resolution of the codebase audit findings (Groups A & B).

The rigid carousel anchors, static polar grids, and frozen phyllotaxis spirals have been replaced by a continuous 2D manifold simulation initialized via PCA and refined through simulated annealing force-directed dynamics. Semantic clusters now naturally group and separate, cross-cluster bridge notes link smoothly, and single-note cluster halos are suppressed.

Alongside the visual overhaul, all core audit findings have been resolved: 13 canonical relation types are exposed directly without synonym loss, note identity is strictly injective across folders and punctuation, relation file edits are protected against silent overwrites, full vault note bodies are fed to GraphRAG synthesis, canvas view filtering is cleanly decoupled from indexing exclusions, and an automated GitHub Actions CI gate guards every commit.

---

## Highlights

- **Organic 2D Manifold Simulation & Force-Directed Clustering:** Replaced rigid concentric circle layouts with an organic force-directed physics engine. Nodes initialize via 2D PCA/spectral layout, dynamic cosine similarity rescaling stretches cluster distances, and simulated annealing cools velocities into stable, natural semantic landscapes (#39, #40, #41, #42).
- **13 Canonical Cypher Relation Types:** The relation builder dropdown now directly offers the 13 canonical Cypher relation types (`IMPLIES`, `EQUIVALENT_TO`, `CONFLICTS_WITH`, `INDEPENDENT_OF`, `REQUIRES`, `GENERALIZES`, `SPECIALIZES`, `EXTENDS`, `REDUCES_TO`, `CONSTRUCTS`, `EMBEDS_IN`, `REFUTES`, `ANALOGOUS_TO`), eliminating lossy multi-synonym collapse while retaining custom relation flexibility (#43, #44).
- **Relation Overwrite Protection:** Modifying a relation edge's type now pre-checks the target file path (`findRelationPathConflict`). If a relation note or custom note already exists at the target path, the mutation is safely blocked with a clear user notice rather than silently overwriting user data (#14, #50).
- **Injective Note Identity Across Folders & Characters:** Path-to-ID generation (`pathToId`) preserves directory structure and URI-encodes spaces and special characters. Files like `Work/Overview.md`, `Work-Overview.md`, and `Work Overview.md` maintain distinct identities, preventing graph and vector store collisions (#12, #51).
- **Live Vault Re-Reads for GraphRAG Vector Neighbors:** Context enrichment re-reads full, current note bodies directly from the vault for vector neighbors, matching active notes and ensuring fresh content reaches LLM synthesis (#15, #46).
- **Decoupled Transient Canvas Filter:** The canvas view filter (`viewFilterQuery`) is now an ephemeral, in-memory filter bar that does not touch persistent indexing settings, and hardcoded domain preset keywords have been removed (#45, #47).
- **Transparent SQLite Persistence Feedback & Test Coverage:** Persistence errors during manual or background vector recalculation are surfaced as `[ERROR]` notices, suppressing false `[OK]` success messages when vectors remain only in volatile WASM memory, backed by comprehensive end-to-end unit tests simulating persistence errors and reconcile rejections (#9, #48, #55).
- **Full UI & Button Localization:** All settings action buttons (Ollama/OpenAI test connection, vault indexing), scatter toolbar actions, and sidebar headings are fully translated in German and English, immediately updating on language dropdown change (#55).
- **Graph Sync Exclusions & Zero-State Reconciliation:** Exclusion patterns are strictly honored during graph sync, and empty vault states (such as deleting all notes or excluding all files) fully reconcile SQLite stores to zero (#10, #52).
- **Automated GitHub Actions CI Quality Gate:** Added `.github/workflows/ci.yml` and `.github/PULL_REQUEST_TEMPLATE.md` ensuring typecheck, lint, test, and production bundle builds pass automatically on every PR (#21, #53).
- **Cleaned Documentation & Localization:** Purged 7 obsolete projection modes from user guides and eliminated dead i18n keys (#38, #49).

---

## Changelog

### Added
- Organic 2D manifold simulation and force-directed layout with PCA/spectral initialization and simulated annealing cooling, replacing rigid circular carousel anchors and frozen phyllotaxis spirals (#41, #42).
- Dynamic similarity matrix rescaling (`rescaleSimilarityMatrix`) stretching off-diagonal cosine similarities to `[0, 1]`, restoring organic semantic cluster separation on the canvas (#39, #40).
- 13 canonical Cypher relation types (`IMPLIES`, `EQUIVALENT_TO`, `CONFLICTS_WITH`, `INDEPENDENT_OF`, `REQUIRES`, `GENERALIZES`, `SPECIALIZES`, `EXTENDS`, `REDUCES_TO`, `CONSTRUCTS`, `EMBEDS_IN`, `REFUTES`, `ANALOGOUS_TO`) directly exposed in the relation builder dropdown without lossy synonym projection (#43, #44).
- GitHub Actions CI workflow (`.github/workflows/ci.yml`) and Pull Request template (`.github/PULL_REQUEST_TEMPLATE.md`) for automated typecheck, lint, test, and bundle verification on PRs and default branch pushes (#21, #53).
- Conflict guard (`findRelationPathConflict`) in relation builder modal preventing silent overwrites of user notes or metadata on edge type modifications (#14, #50).

### Fixed
- Fetch fresh note body from vault for vector neighbors during GraphRAG context enrichment instead of using truncated canvas previews (#15, #46).
- Decouple transient canvas view filter (`viewFilterQuery`) from persistent indexing exclusions, removing confusing preset domain filters from settings (#45, #47).
- Surface SQLite persistence failures as visible `[ERROR]` notices in the canvas toolbar while suppressing misleading `[OK]` status, and add comprehensive test coverage simulating persistence failures and reconcile rejections (#9, #48, #55).
- Fully localize settings action buttons (API testing, vault indexing), scatter toolbar tooltips, and sidebar headings across German and English, dynamically updating UI on language switch (#55).
- Remove 7 obsolete projection mode references from user documentation and clean orphaned translation keys (#38, #49).
- Ensure injective note IDs in `pathToId()` across directory paths and special characters via URI encoding, preventing collisions across folders and naming variations (#12, #51).
- Pass exclusion patterns to graph sync and allow full zero-state database reconciliation when files or notes are deleted (#10, #52).
- Document data safety status and residual risks regarding relation overwrite and exclusions in README and release documentation (#36).

---

## Installation & Upgrade

### Community Plugins (Automatic)
Search for **MemVector Knowledge Engine** in Obsidian Community Plugins and click **Update** (or **Install**).

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the release assets below.
2. Copy all three files into your vault's plugin directory:
   `<vault>/.obsidian/plugins/memvector-knowledge-engine/`
3. Reload Obsidian or toggle the plugin off and on under **Settings → Community Plugins**.
