# Release 0.3.0 — Foundation Relation Labels, Frontmatter-Aware Embeddings & Stable Note IDs

> **Release Version:** `0.3.0`  
> **Release Date:** `2026-10-16`  
> **Target Obsidian Version:** `>= 1.11.4` (Desktop)  
> **Assets:** `main.js`, `manifest.json`, `styles.css`

---

## Why 0.3

This version bump is deliberate. Up to 0.2, MemVector was developed purely as a standalone plugin. From 0.3 on, its
development also connects to further private projects of mine that build on the same vault. Some upcoming changes are
driven by that work and may not make obvious sense when you look at MemVector on its own.

What does not change:

- **MemVector stays a standalone Obsidian plugin, and I keep maintaining it as one.** You do not need anything besides
  MemVector to use any of its features.
- **Compatibility is kept.** Existing vaults, notes, settings and indexes keep working after an update. New behavior is
  opt-in or only affects notes MemVector creates from now on. Existing notes are never migrated silently.

If an update still causes problems in your vault, please
[open an issue](https://github.com/kevinkaupert/obsidian-memvector-knowledge-engine/issues) and describe what changed.
Reports like this are exactly what helps keep MemVector reliable for standalone use.

---

## Highlights

### 1. Foundation Relation Labels
- The bundled STEM vocabulary gains four directed labels for tracing a concept down to its foundations:
  `DEFINED_BY` (concept -> its definition), `USES` (definition -> simpler concept it relies on), `GOVERNED_BY`
  (primitive notion -> axiom) and `EXAMPLE_OF` (concrete instance -> concept).
- Each label has its own edge color in the 2D view.
- **New vaults** get the labels automatically when `wiki/relation-types.json` is created.
- **Existing vaults:** your `wiki/relation-types.json` is not changed. Colors and layout weights for the new labels
  apply right away. To use them in the Relation Builder dropdown and as frontmatter keys (`defined_by:`, `uses:`, ...),
  add the four entries shown in `docs/CONFIGURATION.md`, section 3.5. Check first that you have no existing frontmatter
  field such as `uses:` holding wikilinks you do not mean as typed edges.

### 2. Frontmatter Fields in Embeddings (opt-in)
- New setting **Frontmatter fields in the embedding** (`embeddingFrontmatterKeys`): a comma-separated list of
  frontmatter keys, for example `description, aliases, notation`. Their values are embedded before the note body, in
  the order you list them.
- Helps notes with a short body but a good `description` or useful `aliases` show up in semantic search.
- Empty by default. With the setting empty, the embedded text is exactly the same as before, so updating does not
  re-embed anything. With keys set, only notes that have one of the fields are re-embedded.

### 3. Synthesis and Relation Note Frontmatter
- **Synthesis notes** list their sources as wikilinks (`"[[wiki/A|A]]"`) instead of plain paths, so Obsidian keeps
  them up to date when you rename a source note. `generated.by` now records provider and model
  (`memvector/openai:gpt-4o`) instead of the model name alone.
- **New relation notes** keep their endpoints only in `source_note` and `target_note`. `sources` is no longer filled
  with the two endpoints and is free for real evidence (a script, a paper, a URL). `generated.by` is `user`, since the
  content comes from you in the Relation Builder.
- **New synthesis and relation notes get a stable `id`** (a ULID) in their frontmatter.
- **Existing notes are not migrated.** When you edit an existing relation note in the Relation Builder, it keeps its
  `id` (or gets one if it had none), the two endpoint paths are removed from `sources`, and every other entry you added
  there stays.
- If you read relation notes with Dataview or your own scripts and took the endpoints from `sources`, switch to
  `source_note` and `target_note`; both are present in every relation note.

### 4. Groundwork: Note Identity
- ADR-0007 (`docs/adr/0007-note-identity-frontmatter-id.md`) decides how MemVector will recognize notes by their
  frontmatter `id`, so a renamed or moved note keeps its vector, its position in the 2D view and its edges, even when
  the rename happened while Obsidian was closed or on another device.
- Notes without an `id` keep exactly today's behavior. No behavior changes in this release; the implementation follows
  in [#271](https://github.com/kevinkaupert/obsidian-memvector-knowledge-engine/issues/271).

---

## Upgrade Notes

- No action required. Settings, the local index and existing notes carry over unchanged.
- Optional: add the four new labels to an existing `wiki/relation-types.json` (see Highlight 1).
- Optional: set **Frontmatter fields in the embedding** and re-run **Index entire vault**.
