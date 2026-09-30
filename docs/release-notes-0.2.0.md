# Release 0.2.0 — Reliable Vector Index, Configurable Vault Folders & Feature Freeze

> **Release Version:** `0.2.0`  
> **Release Date:** `2026-09-30`  
> **Target Obsidian Version:** `>= 1.11.4` (Desktop)  
> **Assets:** `main.js`, `manifest.json`, `styles.css`

---

## Overview

Release `0.2.0` makes the local vector index trustworthy and removes the plugin's
assumption that every vault uses a `wiki/` folder layout.

The incremental vector cache introduced in 0.1.8 is hardened end to end: both
indexing paths now embed the same text, every stored vector records the model and
endpoint that produced it, and vectors of different embedding models can no longer be
mixed - not in the database, not in an open 2D view and not in GraphRAG context. Several
data-loss and false-success paths are closed. Relation notes are recognized by one rule
everywhere, and the folders the plugin writes to are now configurable.

The automated test suite grows to 578 tests across 56 test files.

---

## Feature Freeze

With this release the plugin enters a **feature freeze** for the time being. Until
further notice, only bug fixes and stability improvements will be merged; no new
features are planned for upcoming releases.

Feature ideas are still welcome. Please open a
[feature request](https://github.com/kevinkaupert/obsidian-memvector-knowledge-engine/issues/new)
on GitHub describing the use case, so it can be considered once the freeze is lifted.
Bug reports are handled as usual.

---

## Upgrade Notes

- **One full re-embedding after the update.** Vectors stored by earlier versions carry
  no record of the model that produced them. They are treated as unknown instead of
  being attributed to the currently configured model, so the first "Index vault locally now"
  run re-embeds every note. Until then, semantic search and the related-notes radar
  skip those notes. With a local Ollama model this takes a few minutes; with a paid
  embedding API it costs one full indexing run.
- **More text per note is embedded.** The embedded text is no longer cut at
  800-2000 characters. The new setting `embeddingMaxChars` (default `8000`,
  `0` = no cap) controls it; keep it within your model's input limit.
- **Relation notes are identified by `type: relation`.** A note counts as a relation
  note if its frontmatter has `type: relation`, or if it lies inside the relations
  folder. Notes in an unrelated folder that happens to be named `relations` and carry no
  such type are no longer treated as edges. Notes created by the relation builder
  always carry the type, so no action is needed for them.
- **Folders stay where they are.** The new folder settings default to `wiki/relations`,
  `wiki/synthesis` and `wiki/presets`. Changing a folder does not move existing notes.

---

## Highlights

- **Configurable Vault Folders (#173):**
  Settings -> General -> **Vault folders** sets where relation notes, synthesis notes
  and vocabulary presets are written. Relation notes that were moved or whose folder was
  renamed keep working as edges, graph context and radar entries (ADR-0004).
- **No More Mixed Embedding Models (#164, #175, #176, #177):**
  Every vector records its embedding fingerprint (model plus normalized endpoint). A
  model or endpoint switch re-embeds the vault instead of keeping old vectors, open
  views reload their vectors immediately, and GraphRAG enrichment queries only with
  vectors of the active model.
- **One Embedding Text for Both Indexing Paths (#161):**
  "Index vault locally now" and the 2D view's "Calculate Vectors" build identical text and
  cache hashes, so each path reuses the other's work instead of re-embedding everything.
- **Data Safety (#165, #166):**
  A filtered 2D view can no longer delete the stored vectors of notes outside the
  filter, and a retry after a failed database write persists the pending vectors or
  reports the error again instead of claiming success.
- **Stable Live Updates in the 2D View (#162, #167, #168, #169, #171):**
  Editing notes keeps the camera in place, relation-note nodes follow create/delete/
  rename, selection and search stay aligned with the current notes, and a live rescan can
  no longer crash a running vector calculation.
- **Settings Polish (#170):**
  A new preset copied from an intentionally empty vocabulary stays empty, and the
  add-relation-type form is aligned with the type table instead of wrapping mid-form.

---

## Changelog

### Added

- Settings -> General -> **Vault folders**: the folders for relation notes (`relationsFolder`), synthesis notes (`synthesisFolder`) and vocabulary presets (`presetsFolder`) are configurable. Defaults stay `wiki/relations`, `wiki/synthesis` and `wiki/presets`, so existing vaults are unchanged; changing a folder does not move existing notes. The relations folder is also the fallback criterion for relation notes without `type: relation`. Texts that named the fixed `wiki/...` folders now show the configured ones (#173).

### Fixed

- "Index vault locally now" (Settings) and "Calculate Vectors" (2D view) now embed the same text and compute the same cache hash. Settings used the file name plus up to 1500 characters, the toolbar used the display title plus an 800-character scan excerpt, so each path treated the other's stored vectors as stale and re-embedded unchanged notes (#161).
- Switching the embedding model or endpoint no longer mixes vectors from different models. Each vector records the model and endpoint that produced it; other models' vectors count as cache misses and are excluded from search, hydration and the radar (#164). Vectors stored by earlier versions are treated as unknown and re-embedded rather than attributed to the currently configured model (#176).
- An open 2D view no longer keeps vectors of the previous embedding model. Changing the model or endpoint, and every "Index vault locally now" run, reloads the stored vectors into open views; "Calculate Vectors" takes the stored vector on a cache hit, and GraphRAG context enrichment builds its query only from stored vectors (#175).
- The embedding fingerprint no longer treats endpoints whose URL paths differ only in case as the same vector space; only scheme and host are compared case-insensitively (#177).
- Relation notes are recognized by one rule everywhere (edges, graph index, GraphRAG, scatter nodes, vault watcher, radar): frontmatter `type: relation`, or a note inside the relations folder. Moved relation notes and a top-level `relations/` folder now work (#173).
- "Calculate Vectors" in a filtered 2D view no longer deletes the stored vectors of every note outside the filter (#165).
- A retry after a failed database write no longer reports success for vectors that were never saved; pending changes are written before success is reported, or the storage error is reported again (#166).
- A live vault update during "Calculate Vectors" no longer aborts the calculation and leaves the button disabled; notes deleted in the meantime are not counted as cached (#169).
- An open 2D view picks up vectors re-indexed elsewhere on its next rescan; stored vectors take precedence over in-memory ones (#167).
- Editing a note no longer resets the 2D view's pan and zoom, and external changes to the active vocabulary file reload relations and layout weights (#162).
- Creating, deleting or renaming a relation note updates the relation-note nodes of an open 2D view (#168).
- A rescan aligns the selection, hover and search state with the current notes (#171).
- Creating a preset while the active vocabulary is intentionally empty creates an empty preset instead of seeding the 13 STEM types (#170).
- The form for adding a relation type in Settings is the last row of the type table, each field under its column; the reset button sits right-aligned below the table.

### Changed

- The embedded text per note is no longer limited to 800-2000 characters by three independent hardcoded cuts. A single setting, `embeddingMaxChars` (default 8000, 0 = no cap), controls it (#161).

---

## Installation & Upgrade

### Community Plugins (Automatic)

Search for **MemVector Knowledge Engine** in Obsidian Community Plugins and click **Update** (or **Install**).

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the release assets on GitHub.
2. Copy all three files into your vault's plugin directory:
   `<vault>/.obsidian/plugins/obsidian-memvector-knowledge-engine/`
3. Reload Obsidian or toggle the plugin off and on under **Settings → Community Plugins**.
4. Run **Settings → MemVector → "Index vault locally now"** once to rebuild the vector index (see Upgrade Notes).
