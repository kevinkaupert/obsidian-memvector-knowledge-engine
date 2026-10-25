# 0006 — Node colors from the shared kinds file, no `verified: null`

Status: Implemented (0.3.17, branch `feat/note-kinds-colors`)
Architecture: knowOS [ADR-0016](https://github.com/kevinkaupert/knowOS/blob/main/docs/adr/0016-note-kinds-in-one-file.md),
[note kinds contract](https://github.com/kevinkaupert/knowOS/blob/main/docs/contracts/note-kinds.md), vault schema 2
section 7, knowOS Plan 0021 steps 3-4.

## Goal

The 2D view and the sidebar radar color a note by its frontmatter `type` with the colors of the vault's kinds file,
the radar reads `type` instead of guessing it from folder and file names, and relation notes no longer get
`verified: null`.

## Decisions

1. **`src/noteKinds/`**: `kindsPathFromKnowos(raw)` (`knowos.json` key `note_kinds`; absolute or `..` paths refused),
   `kindsProblems(data)` (the contract's checks, the same as Jovian's `kinds.py` and Canvas Tutor's `kinds.ts`),
   `resolveKindColors(path, data, problem)` -> `{colors, source, path, problem}`. Bundled copy
   `src/noteKinds/knowos-contract/note-kinds.json` (byte copy of knowOS, checked by knowOS
   `scripts/contract_copies.py`). An unusable file gives the built-in colors and is reported once (console + Notice).
2. **One color function `noteTypeColor(type)`** used by the 2D view (`drawNodes.ts`) and the radar
   (`radarCanvas.ts`): the active kinds' `color`, then the fixed types `hub` `#c9a25e` (MemVector's former `concept`
   gold), `relation` `#a897c9`, `synthesis` `#c98fae`; anything else -> the neutral color. Following the contract
   (§4.2, ADR-0016 §4) the old values `concept`, `course`, `question`, `source` and untyped notes are neutral; a vault
   kinds file can give a type a color again. The radar's separate brighter palette is replaced, so both views agree.
3. **Untyped notes are untyped**: `buildScatterNode` no longer defaults `type` to `concept` (it stays `""`);
   `classifyNoteType` returns `relation` for relation notes (folder rule unchanged), else the lowercased frontmatter
   `type`, else `""`; the folder/file-name guesses (`/definitions/`, `satz-`, ...) are removed, so the radar and the 2D
   view agree. The uncached frontmatter path of `buildScatterNode` strips quotes like the cached one
   (`type: "definition"` -> `definition`). `nodePosition.ts` keeps its layout fallback (layout is out of scope). `ScatterNoteType` and `RadarNoteType` become `string`. The synthesis prompt
   heading and the relation builder label show the type only when there is one.
4. **Loading**: the plugin resolves the kind colors on layout ready and when `knowos.json` or the named kinds file
   is created, changed, deleted or renamed (old and new path; the existing `knowos.json` watcher gets `delete` and
   `rename`), stores them in the module (`setActiveKindColors`) and redraws open
   views. No new setting.
5. **`relationFileTemplate.ts`** stops writing `verified: null` (schema 2 §7); `status`, `generated`, `description`
   stay. Existing notes keep their `verified`.

## Out of scope

Filters by type in the UI, layout by type, MemVector's own relation vocabulary.

## Steps

1. Tests: `noteKinds` resolver (built-in, vault file, each invalid case, `..`, broken `knowos.json`); color function
   (kind color, deprecated kind keeps its color, fixed types, legacy `concept`/`source` and unknown/empty neutral, vault
   file without colors, removed file -> built-in); `classifyNoteType` with frontmatter type, no guess from folders,
   relation folder; `buildScatterNode` untyped and quoted type with and without metadata cache; relation template
   without `verified`, an edited relation note keeps an existing `verified`; empty-type labels; existing tests updated.
2. Implement decisions 1-5.
3. CHANGELOG, README/CONFIGURATION if they describe colors, version 0.3.17 (manifest, package, lock),
   `main.js` and `cli.js` built.
4. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`; knowOS `scripts/contract_copies.py memvector`.
5. `codex review` before the PR.
