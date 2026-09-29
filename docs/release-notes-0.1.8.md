# Release 0.1.8 — Layout Force Physics Hardening, Atomic Vocabulary Persistence & Multi-Window Stability

> **Release Version:** `0.1.8`  
> **Release Date:** `2026-09-29`  
> **Target Obsidian Version:** `>= 1.11.4` (Desktop)  
> **Assets:** `main.js`, `manifest.json`, `styles.css`

---

## Overview

Release `0.1.8` is an essential reliability, simulation accuracy, and data safety release following a deep post-release audit of the 0.1.7 line.

This release fixes the force simulation layout clamp so that relation weights above 1.0 (such as `EQUIVALENT_TO` at 1.3 and `ANALOGOUS_TO` at 1.1) actually shorten distance in the 2D canvas, prevents silent data loss in Settings vocabulary editing via atomic vault mutations, ensures animation frame scheduling and event listeners properly track Obsidian popout windows, guards bundled presets against accidental shadowing, and expands the automated test suite to 463 tests across 49 test files.

---

## Highlights

- **Relation Weights Above 1.0 Active in 2D Canvas (#134):**
  Previously, the force simulation clamped graph weights to 1.0, treating weights like 1.1 or 1.3 identically to baseline 1.0 relations. The simulation now decouples target distance scaling from normalized affinity via a dedicated `weightFactor`, allowing strongly bound concepts to settle closer together while maintaining collision floors.
- **Atomic Vocabulary Read-Modify-Write Cycles in Settings (#133, #145, #150):**
  Editing relation vocabulary types in Settings no longer risks reverting concurrent or previous edits. Every mutation now reads, patches, and writes only its owned field atomically via Obsidian's `Vault.process` API, preventing race conditions and stale snapshot overwrites.
- **Full Popout Window Support for 2D Scatterplot (#137):**
  Canvas redraw throttling and search pulse animations now resolve against the specific window the canvas element lives in (`canvas.win`) rather than a global window reference. Dragged popouts schedule and cancel animation frames cleanly without dropped redraws or leaked window listeners.
- **Live Active Vocabulary Synchronization across Settings & Views (#135):**
  Every way of modifying the active relation vocabulary (preset activation, creation, rename, delete, and path edits) now immediately triggers a relayout in open 2D views. The vocabulary path input applies cleanly on blur or Enter.
- **Bundled Preset Reservation & Vault Trash Preference (#140, #147):**
  User presets can no longer accidentally collide with or shadow bundled preset names (such as "Law", "Medicine", "Philosophy"). Preset deletion now routes through `fileManager.trashFile`, strictly honoring the user's Obsidian deletion preference (system trash vs. local trash).
- **Localized Context Preview Badges (#141):**
  Dropped the redundant untranslated English "seed" label in the synthesis preview, preserving clean localized `[Auswahl]` / `[Selection]` badges and compact `v`, `g`, `v+g` provenance indicators.
- **Expanded Test Suite (463 Passing Tests):**
  Added 88 new unit and adversarial regression tests covering force distance monotonicity, atomic vocabulary concurrency, and popout window lifecycle transitions.

---

## Changelog

### Fixed

- The 2D view now schedules its animation frames on the window it actually lives in. Both the redraw throttle and the search pulse used a bare `window.` prefix, which resolves to the window the plugin was loaded in, so a view dragged into an Obsidian popout scheduled frames on - and cancelled them against - a window it no longer belonged to. The window-level `mouseup` listener follows the canvas across a move as well (#137).
- Every way of changing the active relation vocabulary now reaches an open 2D view. Deleting, creating or renaming a preset, and editing the vocabulary path, updated the settings while the open canvas kept laying out with the previous vocabulary. The path field is also applied on blur or Enter instead of on every keystroke, so a half-typed path can no longer be persisted or turned into a stray vault file, and table edits are written to whichever file is active at that moment rather than the one that was active when the table was drawn (#135).
- User presets can no longer take a bundled preset's name. `createPreset` and `renamePreset` checked only whether the target file already existed, so a preset named e.g. "Law" was accepted while `wiki/presets/law.json` was still absent and was then listed under the bundled label, beyond rename or delete (#140).
- The context preview no longer prints the untranslated word `seed` next to a selected note. Its origin was already stated by the localized badge, so the duplicate marker is removed rather than translated; traversed rows keep their compact `v` / `g` / `v+g` provenance codes (#141).
- Adding a relation type through the Settings add form now keeps explicit default values. Adding a label that ships bundled layout semantics with weight `1.0` or `repels` unticked dropped both fields, so the inheritance fallback restored the bundled values on the next load - `CONFLICTS_WITH` came back repelling and `EQUIVALENT_TO` at 1.3. Both write paths now use the same serialization (#136).
- Relation type edits in Settings no longer discard each other. Every vocabulary mutation now re-reads the file before writing, so a second weight/repels edit, a delete or an add keeps all previous edits; an unreadable file aborts the write instead of truncating the vocabulary (#133). Each control writes only the field it owns and the whole read-modify-write runs atomically through the vault, so a `repels` change committed elsewhere is no longer reverted by the next weight edit, and two open Settings tables no longer overwrite each other (#145).
- Relation weights above `1.0` now actually shorten the distance between connected notes. The force simulation clamped every graph weight to `1.0`, so the bundled `EQUIVALENT_TO` (1.3) and `ANALOGOUS_TO` (1.1) and any custom weight produced exactly the same layout as a generic relation. Weights at or below `1.0` keep their previous placement unchanged; see ADR-0003 for the mapping (#134).

---

## Installation & Upgrade

### Community Plugins (Automatic)

Search for **MemVector Knowledge Engine** in Obsidian Community Plugins and click **Update** (or **Install**).

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the release assets on GitHub.
2. Copy all three files into your vault's plugin directory:
   `<vault>/.obsidian/plugins/obsidian-memvector-knowledge-engine/`
3. Reload Obsidian or toggle the plugin off and on under **Settings → Community Plugins**.
