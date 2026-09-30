# 0002 - Configurable plugin folders and one relation-note rule

Status: Implemented (PR for #173)
Date: 2026-09-30
Issue: #173

## Goal

The plugin must work in a vault that does not use a `wiki/` folder layout, and
must recognize relation notes by one consistent rule:

1. Every folder the plugin writes to is configurable, with today's paths as
   defaults, so existing vaults keep working unchanged.
2. Whether a note is a relation note is decided by one function, used by every
   caller, that does not depend on a hardcoded folder name.
3. Relation notes that were moved or whose folder was renamed keep working as
   edges, nodes and graph context.

## Current state

Write locations are hardcoded:

| What | Path | Code |
|---|---|---|
| Relation notes | `wiki/relations/rel-...md` | `modals/relationBuilder/relationFileTemplate.ts` |
| Synthesis notes | `wiki/synthesis/synthese-...md` | `modals/SynthesisResultModal.ts` |
| User presets | `wiki/presets/` | `relationVocabulary/presets.ts` (`PRESET_DIR`) |
| Vocabulary file | `wiki/relation-types.json` | default only - already configurable (`relationVocabularyPath`) |

Relation notes are detected by four diverging path rules:

| Caller | Rule |
|---|---|
| `views/vectorScatter/relationEdges.ts` (edges, graph index, GraphRAG) | path contains `wiki/relation` or `/relations/` |
| `views/vectorScatter/types.ts` `isRelationNode` (scatter nodes) | frontmatter `type: relation`, or path contains `/relations/` / starts with `wiki/relations/` |
| `views/vectorScatter/VectorScatterView.ts` (vault watcher) | path contains `wiki/relations/` or `/relations/` |
| `views/sidebar/activeNoteScoring.ts` (radar) | path contains `/relations/` |

Consequences:

- Renaming or moving the relations folder drops those notes from edges, the
  graph index and GraphRAG context, although every note the plugin wrote since
  2026-08-31 carries `type: relation`. New relations are still written to
  `wiki/relations/`, recreating that folder.
- A top-level `relations/` folder is not recognized by three of the rules,
  because `relations/a.md` does not contain `/relations/`.
- Any folder named `relations` anywhere (e.g. `Customers/relations/`) is treated
  as relation notes.
- `wiki/relation` also matches unrelated paths such as `wiki/relationships/`.

## Steps

### Block 1 - one relation-note rule (bug fix, no new settings)

- Add `isRelationNote(file)` in one module: a note is a relation note if its
  frontmatter has `type: relation`, or it lies inside the configured relations
  folder (Block 2; until then the current default `wiki/relations/`). Folder
  match is by path prefix, not substring.
- Route all four callers through it. The watcher can receive a create event
  before the metadata cache has parsed the new file, so it uses the folder check
  plus the cached frontmatter when present; a relation note created outside the
  folder is still picked up by the rescan any create event triggers.
- Tests per caller: moved relation note (frontmatter only) is an edge, a node,
  graph context and a radar "relation"; top-level `relations/` works;
  `Customers/relations/x.md` without `type: relation` is not a relation;
  `wiki/relationships/x.md` is not a relation.

### Block 2 - configurable write folders

- New settings, defaults equal to today's paths:
  - `relationsFolder` (default `wiki/relations`)
  - `synthesisFolder` (default `wiki/synthesis`)
  - `presetsFolder` (default `wiki/presets`)
- One module (e.g. `vaultLayout.ts`) resolves all plugin paths from settings
  (trimmed, no leading/trailing slash, empty value falls back to the default);
  no other code builds these paths. `resolveVocabularyPath` moves there as well.
- Relation builder, synthesis save and preset management write through it.
- Settings UI: three folder fields. The layout change gets an ASCII mock-up and
  sign-off before implementation.
- Tests: each writer uses the configured folder; empty and slash-padded values
  resolve to the default; a changed relations folder is recognized by
  `isRelationNote`.

### Block 3 - texts and docs

- UI strings that name `wiki/relations/`, `wiki/presets/` or `wiki/synthesis/`
  (German and English) show the configured folder instead.
- Update `docs/CONFIGURATION.md`, `README.md`, `docs/ARCHITECTURE.md` and
  `docs/TESTING.md` where they state these paths as fixed.

## Decided

- Frontmatter `type: relation` is the primary criterion, the folder the
  fallback. The plugin already writes the type into every relation note, and it
  survives moves and renames; a folder-only rule would not.
- Defaults stay `wiki/...`. Changing them would silently split existing vaults
  into old and new locations.
- Changing a folder setting does not move existing files. Old relation notes
  keep working through their frontmatter; presets and synthesis notes stay where
  they are. The setting description says so.
- Record the relation-note rule in an ADR, since it defines what the graph,
  GraphRAG and the scatter view treat as an edge.

## Deferred

- Note-type heuristics in `activeNoteScoring.ts` (`/definitions/`,
  `/theorems/`, `/sources/`, `raw/`, ...) are domain conventions of a math wiki,
  not plugin-owned folders. Making them configurable is a separate topic.
- Moving existing files when a folder setting changes. Not needed for
  correctness once detection uses frontmatter; revisit if users ask for it.
- `docs/vision.md` does not exist yet, so this plan could not be checked against
  a stated long-term goal; the direction (vault-agnostic, no imposed folder
  layout) should be confirmed when the vision is written.
