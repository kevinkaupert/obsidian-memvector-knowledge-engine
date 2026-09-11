# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to pre-1.0 feature/PR versioning (0.x.0 for features, 0.0.x for PRs/fixes).

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
