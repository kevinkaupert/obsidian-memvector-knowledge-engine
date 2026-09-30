# Release 0.2.1 — Mental Map Continuity, Graph Safety Gates & Canvas Layout Stability

> **Release Version:** `0.2.1`  
> **Release Date:** `2026-09-30`  
> **Target Obsidian Version:** `>= 1.11.4` (Desktop)  
> **Assets:** `main.js`, `manifest.json`, `styles.css`

---

## Overview

Release `0.2.1` introduces full spatial mental map continuity across vault restarts, hardens SQLite graph and position persistence with fail-safe gates against transient file locks, fixes cluster collapse when declaring new relations, and streamlines relation creation to rely strictly on presets and settings.

The automated test suite expands to 602 tests across 57 test files with 100% pass rate.

---

## Highlights

### 1. Spatial Mental Map Continuity across Restarts (ADR-0005)
- **Node Position Persistence**: Calculated 2D positions are now saved into SQLite (`node_positions`) and re-hydrated whenever the 2D canvas opens, keeping your cognitive spatial map intact across Obsidian restarts.
- **Deterministic 2D Orientation**: Canonical SVD sign-flip normalization prevents axis reflection flips during PCA calculation.
- **Incremental Placement for Unplaced Notes**: When adding new notes to an existing graph, they are seeded next to their most similar neighbor without perturbing established nodes.
- **Edge Radius Persistence**: Selected edge hops radius is persisted across workspace reloads and settings updates.

### 2. Critical Graph & Position Safety Gates
- **`reconcileEdges` Gate (Issues #183, #197, #199)**: Edge reconciliation in SQLite is automatically skipped if loading relation files encounters read errors or file locks, preventing transient I/O issues from wiping valid edges.
- **`positionsHydrated` Gate (Issues #184, #198, #199)**: Writing node coordinates to SQLite is blocked if position hydration failed, and in-memory coordinates from failed hydrations are discarded on subsequent scans to prevent deferred coordinate clobbering.

### 3. Canvas Layout Stability on Edge Addition
- **No Cluster Collapse**: Multi-hop graph topology weights (`HOP_DECAY`) were tuned so that indirect 2- and 3-hop graph paths stay below the spring attraction threshold (0.15). Adding an edge between two clusters pulls only the directly connected nodes together, while indirect neighbors repel naturally.
- **Phantom Node Prevention**: Relation note markdown files in the relations directory are excluded from the canvas node set when `showRelationNotes` is off, eliminating unplaced attractors at (0, 0).

### 4. Streamlined Relation Types
- **Vocabulary Presets as Source of Truth**: The "Frei..." / `CUSTOM` free-text option was removed from the Relation Builder modal dropdown. All relation types are managed cleanly through presets in Settings -> Relation Types.

---

## Changelog

### Added
- 2D scatter node position persistence to SQLite (`node_positions`) with mental map restoration on restart (ADR-0005, #182).
- Edge hops radius dropdown persistence across workspace states (#182).

### Fixed
- Fixed 2D canvas cluster collapse when adding new relation edges by lowering multi-hop decay below spring threshold (#200).
- Excluded relation notes from scatter node scans when `showRelationNotes` is false (#200).
- Protected SQLite graph edges against deletion during relation load failures or partial file locks (`reconcileEdges` gate, #183, #197, #199).
- Protected SQLite node positions against clobbering when hydration fails or across deferred rescans (`positionsHydrated` gate, #184, #198, #199).
- SVD sign-flip canonical normalization on PCA projection axes (#182).
- Incremental neighbor seeding for unplaced notes (#182).

### Changed
- Removed ad-hoc `CUSTOM` / "Frei..." edge type option from Relation Builder modal (#200).

---

## Installation & Upgrade

### Community Plugins (Automatic)
Search for **MemVector Knowledge Engine** in Obsidian Community Plugins and click **Update** (or **Install**).

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the release assets on GitHub.
2. Copy all three files into your vault's plugin directory:
   `<vault>/.obsidian/plugins/obsidian-memvector-knowledge-engine/`
3. Reload Obsidian or toggle the plugin off and on under Settings → Community Plugins.
