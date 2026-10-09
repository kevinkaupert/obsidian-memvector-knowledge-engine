# Release 0.2.4 — Vector Index Integrity

> **Release Version:** `0.2.4`  
> **Release Date:** `2026-10-09`  
> **Target Obsidian Version:** `>= 1.11.4` (Desktop)  
> **Assets:** `main.js`, `manifest.json`, `styles.css`

---

## Overview

Release `0.2.4` hardens the local vector index. Reconciliation is scoped to the active embedding model, and indexing runs where individual notes fail to embed are now reported as partial instead of complete.

The automated test suite grows to 777 tests across 68 test files, all passing.

---

## Highlights

### 1. Fingerprint-Scoped Reconcile (#229)
- `SqliteVectorStore.reconcile` restricts both the path lookup and the delete to the store's embedding fingerprint. Vectors written by another model or endpoint are no longer removed when the vault is reconciled with the current model.

### 2. Partial Index Outcomes (#230)
- `syncVaultVectors` records notes whose embedding call failed (e.g. rate limits, token length rejections) in `failedCount` and `failedPaths`.
- "Index vault locally now" shows `[WARN] Partially indexed` with the number of skipped notes, and logs the skipped paths to the developer console. Previously these runs were reported as `[OK]`.

---

## Changelog

### Fixed
- Reconcile deleting vector rows of other embedding fingerprints (#229).
- Failed embeddings of individual notes being reported as a complete index run (#230).

### Changed
- Added localized strings for the partial index notice in English and German.

---

## Known Limitations

- The vector table still holds one row per note. Syncing with another model overwrites that note's row, and rows of other fingerprints for deleted notes are not cleaned up by a scoped reconcile. Tracked in #234.

---

## Installation & Upgrade

### Community Plugins (Automatic)
Search for **MemVector Knowledge Engine** in Obsidian Community Plugins and click **Update** (or **Install**).

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the release assets on GitHub.
2. Copy all three files into your vault's plugin directory:
   `<vault>/.obsidian/plugins/memvector-knowledge-engine/`
3. Reload Obsidian or toggle the plugin off and on under Settings → Community Plugins.
