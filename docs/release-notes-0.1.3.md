# Release 0.1.3 — Functional Hardening, Graph Identity & GraphRAG Synthesis Overhaul

> **Release Version:** `0.1.3`  
> **Release Date:** `2026-09-14`  
> **Target Obsidian Version:** `>= 1.11.4` (Desktop)  
> **Assets:** `main.js`, `manifest.json`, `styles.css`

---

## Overview

This release delivers significant hardening and core fixes from the comprehensive functional audit across data durability, note and graph identity, settings correctness, and GraphRAG context synthesis.

As an early-stage `0.1.x` release under active development, several review findings have documented partial fixes with tracked residual gaps (see [open issues](https://github.com/kevinkaupert/obsidian-memvector-knowledge-engine/issues)) rather than full resolutions. Key improvements include surfaced SQLite serialization errors, path-derived node identities resolving same-basename folder collisions, interactive multi-relation fanning on the 2D canvas, and synthesis context sourced from full note bodies with a user-configurable character cap.

---

## Highlights

- **Data Durability & Safe Persistence:** SQLite disk serialization failures (`adapter.writeBinary`) are now reliably propagated to callers, triggering visible error notices (`[ERROR] Sync-Fehler`) rather than false success states when vectors exist only in volatile WASM memory (#9). In addition, relation file modification is atomic: previous files are only cleaned up *after* new files are confirmed written (#14; changing an existing relation's type to another type already present for that note pair remains tracked as an open issue).
- **Path-Based Identity Across Folders:** Established a uniform, path-based node identity contract (`pathToId(path)`) across the vault scanner, graph sync, and vector store. Notes sharing identical filenames across different folders (e.g. `Work/Overview.md` vs. `Home/Overview.md`) no longer collide or overwrite each other in the graph or SQLite database (#12; edge cases with slug collisions on punctuation remain tracked).
- **Uncapped Synthesis Content & Full-Note Re-Reads:** Selected notes are freshly re-read from the vault at synthesis time instead of reusing the 800-character canvas layout preview. A new setting `synthesisContentCapChars` (defaulting to `0` / unlimited) eliminates rigid cutoffs and allows full note text to reach capable LLMs (#15; vector neighbor retrieval preferring index-time payloads remains tracked).
- **Interactive Multi-Relation Canvas:** Multiple relations connecting the same pair of notes no longer collapse into one hidden line. Connections render cleanly as a single line by default, smoothly fanning out into interactive quadratic-bezier curves on hover with individual hit-testing for every strand (#29).
- **Semantic Graph Layout Pre-Hydration:** Stored embeddings and typed relations are loaded into memory *before* force layout calculation, ensuring the 2D canvas clusters semantically immediately upon opening rather than falling back to text heuristics (#13).
- **Full Re-Index Reconciliation:** Re-indexing purges deleted/renamed notes, removed WikiLinks, and newly-excluded files from SQLite tables. Runtime existence checks prevent deleted notes from surfacing in GraphRAG context between index runs (#10; note that vault exclusions currently apply only to vector indexing, so excluded notes can still appear as graph neighbors).
- **Native SecretStorage Integration:** Settings strictly adhere to Obsidian's SecretStorage contract, storing secret reference names and dynamically resolving API keys at request time. Supports automatic legacy migration and live credential rotation without re-selection (#8).
- **Testing Infrastructure:** Added a local mock echo server (`testing/mock-echo-server.js`) and a disposable test vault fixture (`testing/fixtures/smoke-test-vault`) for offline integration testing without external API dependencies (#34).

---

## Changelog

### Added
- Reusable local mock echo server (`testing/mock-echo-server.js`) and disposable smoke-test fixture vault (`testing/fixtures/smoke-test-vault`) for offline manual and automated verification (#34, #35).

### Fixed
- Align documentation with actual implementation across README, ARCHITECTURE, GRAPHRAG, and TESTING guides: clarify PCA as the single implemented projection mode (#16), scope of offline/zero-setup operation (#17), add `styles.css` to manual install steps (#18), and correct stale GraphRAG default parameter values (#19, #33).
- Allow full note content in LLM synthesis via configurable `synthesisContentCapChars` setting (defaulting to 0 / unlimited), re-reading full note bodies instead of using the 800-char canvas preview and removing hardcoded 300-char neighbor excerpt truncations (#15, #32).
- Disambiguate multiple relations between the same note pair on the 2D canvas by retaining distinct relation types during edge loading and fanning overlapping connections into expandable quadratic-bezier curves on hover (#29, #31).
- Include relation type in relation file paths to prevent overwriting existing relation files when multiple types connect the same note pair, and preserve the previous file until the new one is confirmed written (#14, #28).
- Hydrate stored embeddings and load relation edges before calculating the 2D vector graph layout, and re-run layout on relation mutations, ensuring semantic clustering and topology weights take effect without falling back to text heuristics (#13, #27).
- Reconcile deleted/renamed notes, removed WikiLinks, and newly excluded files during full re-indexing across both graph and vector stores, and verify target file existence at retrieval time to prevent stale content from entering synthesis context (#10, #26).
- Unify note identity across scanner, typed relations, and graph sync via canonical path-based IDs, eliminating note collisions for same-basename files across different folders and ensuring immediate GraphRAG visibility for newly saved relations (#11, #12, #25).
- Resolve SecretComponent-selected secret by name instead of using the secret reference name as the literal API key (#8, #24).
- Propagate SQLite persistence failures to callers instead of swallowing errors in background queue (#9, #23).
- Respect configured radar note count on canvas instead of flooring at 15 (#20, #22).

---

## Installation & Upgrade

### Community Plugins (Automatic)
Search for **MemVector Knowledge Engine** in Obsidian Community Plugins and click **Update** (or **Install**).

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the release assets below.
2. Copy all three files into your vault's plugin directory:
   `<vault>/.obsidian/plugins/memvector-knowledge-engine/`
3. Reload Obsidian or toggle the plugin off and on under **Settings → Community Plugins**.
