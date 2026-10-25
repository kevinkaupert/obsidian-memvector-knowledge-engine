# MemVector Knowledge Engine — Configuration & Customization Guide

---

## 1. Plugin Settings Overview

The settings menu is organized into 3 focused sections:

1. **General (Allgemein)**
2. **LLM Provider (for AI Synthesis & Co-Pilot)**
3. **Knowledge Domain & Embedding Provider Setup (with SQLite Indexing)**

---

## 2. Section Details

### Section 1: General (Allgemein)
- **Language / Sprache:** Choose UI language (`Deutsch` / `English`). All setting titles, descriptions, dropdown options, and notices translate automatically when toggled.
- **Vault folders:** Where the plugin writes its own notes. Changing a folder does not move existing notes.
  - **Relation notes folder (`relationsFolder`, default `wiki/relations`):** New relation notes from the Relation Builder go here. A note counts as a relation note if its frontmatter has `type: relation` (anywhere in the vault) or it lies inside this folder (ADR-0004), so moved relation notes keep working.
  - **Synthesis notes folder (`synthesisFolder`, default `wiki/synthesis`):** Saved synthesis notes go here.
  - **Vocabulary presets folder (`presetsFolder`, default `wiki/presets`):** User presets are listed from and created in this folder.
  Values are trimmed and stripped of leading/trailing slashes; an empty value falls back to the default. The field is applied on blur or Enter, not on every keystroke.
- **Write through Jovian (`writeViaJovian`, default off) and Jovian command (`jovianCommand`, default empty):**
  Saves synthesis and relation notes through [Jovian](https://github.com/kevinkaupert/jovian)'s write gate
  (`jovian gate`, protocol 1) instead of Obsidian's vault API, for users who run Jovian. The gate locks the note, refuses
  a write when the note changed since MemVector read it (and keeps the content in `.jovian/conflicts/`), and records
  each write in `.jovian/journal.jsonl` with `client.component: "memvector"`. The command is the `jovian` CLI (e.g.
  `~/venv/bin/jovian`, `~` is expanded); empty runs `python3 -m jovian.gate`. Obsidian puts `/opt/homebrew/bin` and `/usr/local/bin` first on PATH, so with several Pythons installed `python3` may not be the one Jovian is installed in; then enter the full path of the `jovian` CLI (e.g. `~/Library/Python/3.9/bin/jovian`). "Test gate" runs `jovian gate --version`.
  Before each save MemVector checks the gate; if it does not answer (or the vault has no local path), nothing is saved
  and the error names the cause; the dialog stays open, so the note can be saved again after fixing the setting (#292).
  With the setting off, MemVector saves directly and Jovian is not needed.
  After a gate call started there is no direct fallback: on a refusal, timeout or unclear answer nothing is written and
  the usual save error appears. Folders are still created by Obsidian. Deleting a newly created relation note after a
  failed graph write stays direct, since the gate cannot delete. Desktop only (the plugin is desktop only anyway).
- **Path & File Exclusions (`vectorSearchExclusions`):** Global exclusion rules for 2D Graph, vector indexing, graph sync, and GraphRAG context enrichment (default `""`, e.g. `-path:schema -file:index -file:log -file:README`). Same syntax as Obsidian Graph View. An open 2D view rescans its notes shortly after the field changes; changing a layout weight updates its layout right away.
- **Unselected Label Opacity:** Opacity for title labels of non-selected, non-connected notes in the graph view (default `35%`).
- **Mini-Radar Note Count ($X$):** Number of nearest vector neighbors framed in the sidebar radar view (default `10`).
- **Show Relation Notes (`showRelationNotes`):** Render relation notes (frontmatter `type: relation`, or notes in the relations folder) as nodes in the 2D canvas (default off). Relations stay visible as typed edges either way - this only toggles the relation files as dots. Takes effect immediately in an open 2D view.
- **2D Canvas Visual Style (`scatterVisualStyle`):** `Monochrome` / `Muted Type Colors` / `Ink & Focus Glow` (default `ink`). Moved from the floating toolbar into Settings.
- **Note colors (`Muted Type Colors` and the sidebar radar):** a note is colored by its frontmatter `type` with the colors of the knowOS kinds file ([ADR-0016](https://github.com/kevinkaupert/knowOS/blob/main/docs/adr/0016-note-kinds-in-one-file.md)): the file named in `knowos.json` as `"note_kinds": "wiki/kinds.json"` (a `color: "#rrggbb"` per kind), else the built-in kinds (definition, axiom, theorem, proof, example, counterexample, remark). `hub`, `relation` and `synthesis` have fixed colors; any other value (also the old `concept`) and untyped notes are neutral. The radar reads `type` from the frontmatter and no longer guesses it from folder or file names. An unusable kinds file is reported once and the built-in colors apply.
- **Include Agent Guidelines (`includeAgentsGuidelines`):** Include the vault's own `AGENTS.md` (or the configured guideline files) as house-style guidance in the synthesis prompt (default off). Moved from the floating toolbar into Settings.
- **Agent Guideline Files (`agentsGuidelinePaths`):** Vault paths (comma-separated) loaded as house-style rules for synthesis when "Include agent guidelines" is enabled (default `AGENTS.md`).

---

### Section 2: Knowledge Domain & Embedding Provider Setup

> [!IMPORTANT]
> **Independent Embedding Provider & LLM Synthesis Provider**
> You can use local Ollama (`bge-m3`) for dense 2D embeddings **while simultaneously using Anthropic Claude API or OpenAI GPT-4o for synthesis**!

#### Dedicated Embedding Settings

- **Embedding Provider (`embeddingProvider`):**
  - **Ollama (Local):** `http://localhost:11434/v1`, Model: `bge-m3`
  - **OpenAI Embeddings:** `https://api.openai.com/v1`, Model: `text-embedding-3-small`
  - **Custom REST Endpoint:** User-defined base URL and model name
- **Embedding API Base URL (`embeddingApiBaseUrl`):** Endpoint URL for vector embeddings.
- **Embedding API Key (`embeddingApiKey`):** API key for vector embeddings (type `ollama` for local Ollama).
- **Embedding Model Name (`embeddingModel`):** Exact model name (e.g. `bge-m3`, `nomic-embed-text`, `text-embedding-3-small`).
- **Embedding text cap (`embeddingMaxChars`):** Maximum characters per note sent to the embedding model, default `8000`, `0` = no cap. The embedded text is the file name followed by the note body without frontmatter, built identically by "Index entire vault" and the 2D view's "Calculate vectors" button, so vectors computed by one path are cache hits for the other. Keep the value within the model's input limit (`bge-m3` and the OpenAI embedding models accept about 8k tokens); longer input is truncated or rejected depending on the provider. The cache hash covers the capped text, so changing the cap re-embeds only the notes whose embedded text actually changes.
- **Frontmatter fields in the embedding (`embeddingFrontmatterKeys`):** Empty by default, so no frontmatter is embedded. A comma-separated list of frontmatter keys, e.g. `description, aliases, notation` (fields meant for concept matching), adds their values as `key: value` lines between the file name and the body, in the order listed. Lists are joined with `, `; empty values and nested objects are skipped. Both indexing paths use it. The cache hash covers these lines, so changing the setting or a listed field re-embeds only the notes whose embedded text changes; notes without any listed field keep their vectors.
- **Failed embeddings:** Both "Index entire vault" and "Calculate vectors" run the same pipeline (`src/sync/vectorPipeline.ts`). A note whose embedding request fails (e.g. a rate limit) is skipped and keeps its previous stored vector; the run then reports `[WARN]` with the number of skipped notes and logs their paths to the developer console. A run is aborted with `[ERROR]` when its first embedding request fails (usually a wrong endpoint or model) or after 3 failures in a row; the vectors calculated until then are still stored, but stored vectors of deleted notes are only cleaned up by a run that is not aborted.
- **WikiLinks as graph relations (`includeWikiLinksAsRelations`):** Off by default. Controls only the graph index used by synthesis (GraphRAG): when on, `[[WikiLinks]]` are indexed as `LINKS_TO` edges. Takes effect on the next full vault re-index. It does not affect the 2D view (ADR-0008); there the weight below counts.
- **Layout weights (`layoutWeightSemantic`, `layoutWeightLinks`, `layoutWeightRelations`):** 0-2, defaults 1 / 0.3 / 1. How strongly embedding similarity, resolved WikiLinks and typed relations pull notes together in the 2D view; 0 switches a signal off everywhere in the layout. Conflict relations always repel. A change re-lays out the map from the current positions (ADR-0008).
- **Background indexing on vault changes (`autoIndexVaultOnChanges`):** Off by default (opt-in). When enabled, a plugin-level listener continuously monitors vault changes (`create`, `modify`, `rename`, `delete`, and `metadataCache` changes) and incrementally updates embeddings and graph relations in `memvector-local.sqlite` after a short debounce window (800 ms for notes, 400 ms for relations), even when the 2D scatter view is closed or hidden. Embedding costs stay strictly bounded: note content hashes are checked before sending requests to the embedding model, renames move existing vectors and coordinates without re-embedding, and global exclusions (`vectorSearchExclusions`) are respected. Open 2D views consume from the same pipeline and reflect changes automatically.
- **Gesamtes Vault lokal indizieren:** Computes embeddings and graph connections for all markdown files and stores them directly in the local `memvector-local.sqlite` database.

#### Knowledge Domain Modes

- **`general` (Universal Notebook):** Term frequency + semantic clustering for PKM, research, and code.
- **`math` (Mathematics & Formal Sciences):** LaTeX formula extraction and formula overlap scoring for formal definitions, theorems, and proofs (replaces lexical word overlap with formula token overlap).

---

### Section 3: LLM Provider Setup (for AI Synthesis)

Configures the Large Language Model used for **selection-based synthesis** and reasoning notes.

| Provider | Base URL | API Key | Default Model |
|---|---|---|---|
| **Ollama (Local)** | `http://localhost:11434/v1` | `ollama` (or blank) | `deepseek-r1:7b` |
| **Anthropic Claude** | `https://api.anthropic.com/v1` | Your `sk-ant-...` Key | `claude-sonnet-5` |
| **DeepSeek Cloud** | `https://api.deepseek.com/v1` | Your `sk-...` Key | `deepseek-reasoner` |
| **OpenAI** | `https://api.openai.com/v1` | Your `sk-...` Key | `gpt-4o` |
| **OpenRouter** | `https://openrouter.ai/api/v1` | Your `sk-or-...` Key | `anthropic/claude-sonnet-5` |
| **Custom Endpoint** | User-defined (e.g. `http://localhost:8000/v1`) | (Optional) | User-defined |

> Each provider keeps its own API key in settings — switching the provider dropdown preserves previously entered keys.

#### GraphRAG Context Budget

All context caps are plugin settings - `0` always means *unlimited*. Nothing is silently trimmed by hidden model-tier budgets anymore (Issue #103).

- **Graph neighbors per hop level (`hopLevelNeighborLimit`):** Maximum number of GraphRAG context neighbors admitted per hop level (default `2`, `0` = unlimited per level). Every hop level gets its own quota, so a dense immediate neighborhood can no longer crowd deeper-hop notes out of the synthesis context.
- **Vector neighbors (`vectorNeighborLimit`):** Maximum number of semantically similar notes added to the GraphRAG context (default `2`, `0` = unlimited).
- **Minimum vector similarity (`minVectorSimilarity`):** Minimum cosine similarity (0-1) a note needs to enter the context via the vector channel (default `0.75`, `0` = off). Applied even when vector neighbors are unlimited, so "unlimited" stays scoped to the selection instead of pulling in the whole vault.
- **Total context notes (`totalContextLimit`):** Maximum number of enriched context notes (vector + graph) in the synthesis prompt (default `0` = unlimited).
- **GraphRAG hop depth (`synthesisHopDepth`):** Maximum graph traversal depth (1-3) for synthesis context enrichment. Controlled from the toolbar's **Synthese** section only (not in Settings); independent from the visual canvas hop setting.
- **Agent guidelines character cap per file (`agentsGuidelinesCharCap`):** Maximum characters per agent guideline file included in the synthesis prompt (default `0` = unlimited, full file).

The toolbar's **Synthese** section shows a scrollable **context preview** listing every enriched note with its source (`[graph]` / `[vector]` / `[graph+vector]`) and the reason it was included (hop distance and/or similarity). The preview uses the same code path as the real synthesis, so it is exactly what gets sent.

---

### Section 3.5: Relation Vocabulary (`wiki/relation-types.json`)

The Relation Builder's type dropdown is read from a configurable vault file (default `wiki/relation-types.json`). If the file doesn't exist yet, it is created automatically the first time you open the Relation Builder, seeded with the 17 canonical labels (`IMPLIES`, `REQUIRES`, `DEFINED_BY`, `USES`, `GOVERNED_BY`, `EXAMPLE_OF`, `EQUIVALENT_TO`, `GENERALIZES`, `SPECIALIZES`, `EXTENDS`, `REDUCES_TO`, `CONSTRUCTS`, `EMBEDS_IN`, `REFUTES`, `CONFLICTS_WITH`, `INDEPENDENT_OF`, `ANALOGOUS_TO`) - one entry per label.

An existing file is never extended automatically, so a file created before these labels were bundled does not list `DEFINED_BY`, `USES`, `GOVERNED_BY` and `EXAMPLE_OF`. Their colors and layout weights already apply, but the Relation Builder dropdown and the frontmatter typed-link keys (`defined_by`, `uses`, `governed_by`, `example_of`) only follow once the terms are in the file. To adopt them, add these entries to `terms`:

```json
{ "key": "relDefinedBy", "label": "DEFINED_BY", "term": "is defined by", "category": "Preconditions", "bidirectional": false, "reversed": false },
{ "key": "relUses", "label": "USES", "term": "uses", "category": "Preconditions", "bidirectional": false, "reversed": false },
{ "key": "relGovernedBy", "label": "GOVERNED_BY", "term": "is governed by", "category": "Preconditions", "bidirectional": false, "reversed": false },
{ "key": "relExampleOf", "label": "EXAMPLE_OF", "term": "is an example of", "category": "Generalization & Specialization", "bidirectional": false, "reversed": false }
```

Check first that no existing frontmatter field named `uses`, `defined_by`, `governed_by` or `example_of` holds wikilinks you do not mean as typed edges.

You can edit this file at any time to customize the vocabulary for any domain (mathematics, medicine, law, engineering, etc.):

```json
{
  "terms": [
    { "key": "relTreats", "label": "TREATS", "term": "treats", "category": "Clinical", "bidirectional": false, "reversed": false },
    { "key": "relContraindicated", "label": "CONTRAINDICATED_WITH", "term": "is contraindicated with", "category": "Clinical", "bidirectional": true, "reversed": false }
  ]
}
```

- `key`: stable identifier used internally.
- `label`: the canonical relationship type stored in the SQLite graph table and YAML frontmatter, displayed in the Relation Builder dropdown.
- `term`: descriptive natural language phrase for the relationship. It is not shown in the dropdown, which displays the canonical `label`.
- `category`: dropdown group heading.
- `bidirectional`: whether the relationship holds symmetrically in both directions.
- `reversed`: swaps source/target when creating a relation or selecting a different reversed type (e.g. "follows from"). Editing an existing relation while retaining its canonical label preserves its already-stored direction. The UI also includes an interactive "Richtung umkehren" (swap direction) button for explicit direction changes during editing.
- `weight` (optional, default `1.0`): 2D layout attraction strength for this label - vocabulary-driven instead of hardcoded type maps (ADR-0002). The bundled STEM default encodes `EQUIVALENT_TO: 1.3`, `ANALOGOUS_TO: 1.1`, `INDEPENDENT_OF: 0.05`. The attraction saturates at `6`: a higher weight is stored as entered but behaves like `6`, and the Settings table shows a notice when you enter one.
- `repels` (optional, default `false`): when true, the 2D layout actively pushes connected notes apart (e.g. `CONFLICTS_WITH`).

Both fields are optional because they fall back to the bundled semantics for their canonical label. A vocabulary file written before these fields existed therefore keeps its layout behavior, and so does an edge whose label is missing from the preset you switched to. Setting a field explicitly always wins - including `repels: false`, which deliberately neutralizes a bundled repulsion. A label the plugin does not ship (your own custom type) has no bundled fallback and uses the generic `1.0`.

The preselected type uses the same vocabulary resolution as an explicitly selected type, including `bidirectional` and `reversed`. Save conflict checks inspect every relation file, including duplicate identities and files excluded from the graph view; a duplicate target blocks saving before any file or graph writes.

### Relation type presets & manager (Settings → Relation Types)

- **Shared with Canvas Tutor (knowOS ADR-0011, since 0.3.10).** A vocabulary file follows the knowOS relation-vocabulary contract (`docs/contracts/relation-vocabulary.md` in knowOS): besides MemVector's fields a term may carry `canvas: {"slot": "N"|"S"|"E-up"|"E-down"|"W-up"|"W-down", "subject": "source"|"new"}` (its direction handle in Canvas Tutor) and `deprecated`; the file may carry `schema` and `name`. MemVector keeps all of these, and any field it does not know, when it rewrites a file, and keeps entries it cannot read instead of dropping them.
  - **`knowos.json`:** switching the preset writes `{"relation_vocabulary": "<preset path>"}` to `knowos.json` at the vault root (only that key; other keys stay). When `knowos.json` names an existing preset at startup or after the file changed, MemVector uses that preset. Without `knowos.json` the setting below decides, as before.
  - **One-time update of older files:** the active vocabulary file, if it predates the contract (no `schema`, no `canvas`) and contains STEM types, gets the missing default types `DEFINED_BY` and `EXAMPLE_OF` and the six default canvas slots, plus `"schema": 1`. The previous version is saved next to it as `<name>.pre-schema1.json` first, and a notice names what changed. If that backup file already exists, nothing is changed. To undo: replace the file with the backup and add `"schema": 1` to it; it is then never updated again.
  - The bundled presets carry canvas slots (STEM: the six of Canvas Tutor; Law, Medicine, Philosophy: suggestions).
  - **Canvas handles (since 0.3.11):** the section *Canvas-Griffe (Canvas Tutor)* shows the handles as a compass; per handle choose the type and the subject ("new card IS AN EXAMPLE OF source card": subject = new card). A type on another handle moves after a confirmation. In the type table a sign after the label shows the handle (`REQUIRES ↑`); the row menu `⋯` marks a type as deprecated (it leaves its handle and is no longer offered for new relations) or deletes it.

- **Presets** are named vocabulary files in the presets folder (`presetsFolder`, default `wiki/presets/`; e.g. `stem.json`, `law.json`). The active preset is simply the file `settings.relationVocabularyPath` points to. Bundled presets ship in-memory (STEM default, plus Law, Medicine, and Philosophy stubs) and are written to `wiki/presets/` on first activation. Switching presets reloads the vocabulary in memory - no re-embedding or re-indexing is required because edge labels are stored as strings in SQLite.
- **Free-text custom types:** when you save a relation with a free-text type in the Relation Builder, the type is automatically appended to the active vocabulary file under the `"Custom"` category (default weight `1.0`) and appears in the dropdown on the next open - no manual JSON editing.
- **Bundled preset names are reserved.** `stem`, `law`, `medicine` and `philosophy` identify the bundled presets, and a preset is identified by its file key alone. Creating or renaming a user preset to one of those names is rejected with a message naming the conflict. Only the exact key is reserved - "Law & Contracts" becomes `law-contracts.json` and is fine.
  If a vault created such a preset before this was enforced, its file still sits at the reserved key and the manager presents it under the bundled label, where it cannot be renamed or deleted. The plugin does not detect this automatically, and deliberately so: the type table writes to whichever preset is active, so a legitimately customized bundled preset and a name collision produce files that look exactly alike. To recover, rename the file in `wiki/presets/` yourself - it then reappears as your own preset under its new name.

- The **Settings Relation Type Manager** shows the active preset selector (with create/rename/delete for user presets), a type table (label, category, weight, direction, repels) and a "Reset to STEM default" action. All mutations rewrite the vault-owned preset file.
- **Weight and repels are edited in place** in the table - change the number or tick the checkbox and it is written immediately. Both fields are omitted from the file only when the bundled defaults for that label would reproduce the exact pair you chose - for a label with no bundled layout semantics that is weight `1.0` with `repels` unticked, which keeps the JSON readable. On a label that ships its own defaults they are written out explicitly, so unticking `repels` on `CONFLICTS_WITH` or setting `EQUIVALENT_TO` to `1.0` sticks instead of being restored on the next load. The add form and the in-place editor follow the same rule. Deleting and re-adding a type is not needed and would lose its category, wording and `reversed` flag.
- Every change to the active vocabulary (add, delete, weight/repels edit, reset, preset switch, preset create/rename/delete, and editing the path below) re-runs the force layout in an open 2D view straight away, since per-label weights move nodes.

- The **Active vocabulary file** path is applied when you leave the field or press Enter, not while you type. A half-typed path is not a state worth keeping: the plugin creates a vocabulary file at whatever path it is given, so committing every keystroke would leave stray files - and folders - behind in your vault.

---

## 3. Storage Layer (Local SQLite via WASM)

All note embeddings and graph relationships are stored in:
`<vault>/.obsidian/plugins/memvector-knowledge-engine/memvector-local.sqlite`

- **Database Engine:** `sql.js` (SQLite compiled to WebAssembly), requiring zero external processes or Docker containers.
- **Tables:**
  - `notes`: `(id TEXT PRIMARY KEY, title TEXT, path TEXT)`
  - `edges`: `(src TEXT, tgt TEXT, type TEXT, description TEXT, bidirectional INTEGER, original_term TEXT, updated_at TEXT)`
  - `vectors`: `(id TEXT PRIMARY KEY, path TEXT, title TEXT, content TEXT, vector TEXT, content_hash TEXT, mtime INTEGER, embedding_fingerprint TEXT)`
  - `node_positions`: `(id TEXT PRIMARY KEY, path TEXT, x REAL, y REAL, updated_at INTEGER)` - 2D view coordinates. A node is written only when it moved more than half a canvas unit since its last successful write; writes within one second are merged into one, and a pending write is flushed when the view closes. A position at exactly `(0, 0)` is stored and restored like any other. Rows of notes that were deleted or excluded from indexing are removed by "Index vault locally now" and by every "Calculate vectors" run that is not aborted; notes only hidden by a view filter or by relation-note visibility keep theirs. The tolerance, delay and the bounded-adjustment parameters are documented in `src/views/vectorScatter/layout/layoutTunables.ts`.
- **Embedding fingerprint:** Every stored vector records the model and endpoint that produced it (`embedding_fingerprint`, model name plus normalized API base URL). A stored vector counts as a cache hit only when both its content hash and its fingerprint match the current settings, and semantic search, the related-notes radar and the 2D layout only use vectors of the active fingerprint. After changing `embeddingModel` or `embeddingApiBaseUrl`, the next indexing run re-embeds every note. An indexing run ("Calculate vectors" in the 2D view or "Index vault locally now" in Settings) that is still going when the model or endpoint changes is cancelled: its vectors are neither shown in the view nor stored, and it has to be started again for the new model; until then, notes not yet re-embedded are left out of search instead of being compared across incompatible vector spaces. Vectors stored before fingerprints existed have unknown provenance and are never attributed to a model: they are skipped by search and count as cache misses, so the first indexing run after the update re-embeds every note and overwrites them.
- **Multi-Hop Traversal:** Executed locally via recursive SQL CTE queries (`WITH RECURSIVE reachable...`). Traversal is bidirectional: both directions of a stored edge are followed. Bidirectional relations are stored as two rows (one per direction), so live-saved relations are traversable from either endpoint immediately (Issue #120).

---

## 4. Secret Storage & Privacy

All API keys (LLM keys and embedding keys) are securely stored in Obsidian's native `app.secretStorage` API rather than in `data.json`.
- `data.json` contains only non-sensitive configuration (model names, URLs, thresholds, visual styles).
- Remote servers only receive requests explicitly initiated by the user (embedding computation or synthesis). All graph data and SQLite storage remain 100% on device.
