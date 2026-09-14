# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to pre-1.0 feature/PR versioning (0.x.0 for features, 0.0.x for PRs/fixes).

## [0.1.3] - 2026-09-14

### Added
- Reusable local mock echo server (`testing/mock-echo-server.js`) and disposable smoke-test fixture vault (`testing/fixtures/smoke-test-vault`) for offline manual and automated verification (#34, #35).

### Fixed
- Align documentation with actual implementation across README, ARCHITECTURE, GRAPHRAG, and TESTING guides: clarify PCA as the single implemented projection mode (#16), scope of offline/zero-setup operation (#17), add `styles.css` to manual install steps (#18), and correct stale GraphRAG default parameter values (#19, #33).
- Allow full note content in LLM synthesis via configurable synthesisContentCapChars setting (defaulting to 0 / unlimited), re-reading full note bodies instead of using the 800-char canvas preview and removing hardcoded 300-char neighbor excerpt truncations (#15, #32).
- Disambiguate multiple relations between the same note pair on the 2D canvas by retaining distinct relation types during edge loading and fanning overlapping connections into expandable quadratic-bezier curves on hover (#29, #31).
- Include relation type in relation file paths to prevent overwriting existing relation files when multiple types connect the same note pair, and preserve the previous file until the new one is confirmed written (#14, #28).
- Hydrate stored embeddings and load relation edges before calculating the 2D vector graph layout, and re-run layout on relation mutations, ensuring semantic clustering and topology weights take effect without falling back to text heuristics (#13, #27).
- Reconcile deleted/renamed notes, removed WikiLinks, and newly excluded files during full re-indexing across both graph and vector stores, and verify target file existence at retrieval time to prevent stale content from entering synthesis context (#10, #26).
- Unify note identity across scanner, typed relations, and graph sync via canonical path-based IDs, eliminating note collisions for same-basename files across different folders and ensuring immediate GraphRAG visibility for newly saved relations (#11, #12, #25).
- Resolve SecretComponent-selected secret by name instead of using the secret reference name as the literal API key (#8, #24).
- Propagate SQLite persistence failures to callers instead of swallowing errors in background queue (#9, #23).
- Respect configured radar note count on canvas instead of flooring at 15 (#20, #22).

## [0.1.2] - 2026-09-11

### Fixed
- Eliminated Node.js filesystem access (`node:fs` / `require("fs")`) in compiled `main.js` bundle by configuring esbuild with `--platform=browser` (#2).
- Replaced Node `Buffer` with standard Web API `atob` in `getEmbeddedWasmBinary()` to prevent unsafe type operations and guarantee mobile Obsidian compatibility (#2).
- Implemented `getSettingDefinitions` on `MathWikiSettingTab` and decoupled internal tab rerendering from deprecated `display()` (#2).
- Removed unused imports and variables across modals and views (`DomElementInfoCompat`, `header`, `hashString`, `TFile`) (#2).
- Removed 4 `!important` declarations from canvas and radar cursor styles in `styles.css` (#2).

## [0.1.1] - 2026-09-10

### Added
- Embedded fallback `sql-wasm.wasm` binary for zero-setup Community Plugin installs.

### Fixed
- Resolved automated Obsidian Community Plugin review findings.
- Canonical plugin ID updated to `memvector-knowledge-engine` to comply with directory rules.
- Stabilized force simulation against coordinate divergence on zoom/drag.

## [0.1.0] - 2026-09-09

### Added
- Initial release of MemVector Knowledge Engine: local-first 2D vector-space graph, SQLite graph engine, and hybrid GraphRAG co-pilot.
