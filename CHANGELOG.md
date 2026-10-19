# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project stays below 1.0.0: features and fixes alike only raise the patch version (0.3.x).
Releases are cut only when the maintainer explicitly asks for one.

## [Unreleased]

## [0.3.6] - 2026-10-19

### Changed
- **The 2D map no longer jumps on routine actions** (Plan 0005 step 3, #284):
  - deleting a relation in the relation builder adjusts only the area around its notes instead of rearranging the whole map; every relation change from the builder stays a local adjustment, also in very small vaults;
  - a note that moves only because a nearby note changed moves at most 0.15 x node spacing per adjustment;
  - the node spacing slider scales the existing map instead of re-running the layout, and the scaled positions are saved;
  - the cloud spacing slider only stores the value; it takes effect at the next "Layout neu anordnen" (#283 is redefined in step 4);
  - the filter in the view only hides notes: hidden notes keep their place and keep shaping the layout, so changing the filter never moves the map.
- **Layout signal model** (Plan 0005 step 4, ADR-0008): notes are placed by three signals with one weight each in the settings - semantic similarity, WikiLinks and typed relations (0-2, defaults 1 / 0.3 / 1; 0 switches a signal off everywhere). The signals add up instead of the strongest winning, so a relation between similar notes now pulls them closer. WikiLinks come from Obsidian's resolved links and can be switched off completely (before, they always pulled through the similarity). Folder, word and formula overlap and the pull of notes 2-4 hops away no longer place notes. "WikiLinks as graph relations" now only controls the graph index used by synthesis; the knowledge domain only affects synthesis.
- **Edge line style shows where an edge comes from:** solid for a relation note, dashed for a typed link written only in a note's frontmatter, dotted for an unconfirmed `<label>_suggested` link (was dashed). A frontmatter-only edge no longer looks like a stored relation.

### Documentation
- Plan 0005 (layout forces and stability, #284, #283), step 1: inventory of every force, its formula, reach and setting, and of every trigger that moves notes, with findings (WikiLinks act twice, graph and similarity combined by `max`, cloud spacing is a point repulsion radius, filters are layout inputs), and the target signal model decided by the owner: semantic, WikiLink and relation signals with one source each, added in one function with a weight each (0 = off everywhere); folder and word overlap and hop forces removed. No behavior change.

### Tests
- Characterization of today's layout (Plan 0005 step 2): every path a WikiLink takes, similar pair, relation weights and `max`, conflict pair, cloud spacing on single points (#283), groups, and movement per trigger (reopen, edit, hide/show, relation delete, spacing slider), with measured distances as inline snapshots.

## [0.3.5] - 2026-10-19

### Fixed
- **Synthesis note file name nests folders and keeps `%20`**: the name came from the selected notes' path-based ids,
  so a synthesis of `Daily Notes/2026-10-03-Inbox/Roche-Limit Skizze` was saved as
  `synthese-daily%20notes/2026-10-03-inbox/roche-limit-skizze-1.md` in subfolders. It is now one flat file in the
  synthesis folder named from the note titles (e.g. `synthese-roche-limit-skizze.md`), still shortened to 50
  characters and made unique (#277).
- **Duplicate frontmatter `id`: a rename that hands the id to another note lost the previous owner's data**: when two
  notes share an `id` and a rename makes the other note sort first, the previous owner's vector, 2D position and graph
  node were overwritten. Its rows now move to its path key before the rename takes the id. Open scatter views re-read
  every note of a duplicated id on each change batch, so two nodes never share a key until a full rescan (#279).

## [0.3.4] - 2026-10-18

### Fixed
- **"Layout neu anordnen" leaves related notes far apart**: one free pass from scratch did not settle when node spacing
  is small, so relation edges stayed long and crossed until a spacing slider triggered another pass. A layout built
  from scratch now runs further passes until it settles (best effort: at most 6, within a work budget, none above
  about 500 notes). In the integration vault (34 notes, spacing 120/750) it settles after 4 passes in about 40 ms;
  the longest relation edge goes from 785 to 551 units. ADR-0006 addendum.

### Changed
- No user-visible change. The 2D view is split (#273): vault watchers (`vaultWatchers.ts`), stored vector and position
  loading with the map gates (`nodeHydration.ts`) and search (`searchController.ts`) leave `VectorScatterView.ts`
  (1,145 -> 984 lines); "Calculate vectors" leaves `toolbar.ts` (`toolbar/calcVectors.ts`). `vaultIndexPipeline.ts`
  is one class with one job and stays as it is.
- `applyGraphVectorProjection` is split into its placement and simulation steps; `drawNodes` and `drawEdges` take an
  options object instead of 12 and 13 positional arguments; the sidebar radar is split into geometry, canvas and DOM
  parts (#76).
- The gesture state of the 2D view (pan drag, lasso) is one `InteractionState`, and `ScatterViewContext` documents who
  owns each field (#77).
- `resolveEdgesForSave` gets the index of the edited edge explicitly; `loadRelationFiles` is now
  `loadRelationEdgeRecords`; the per-edge batch save is kept and its guarantees are documented (#129).

### Tests
- Characterization tests recorded before the split: golden layout snapshots for every placement and simulation path,
  full call logs of 2D frames and of the radar, the radar's and the 2D view's mouse flows, search cycling and pulse
  across windows, watchers reading live state, the indexer subscription and the hydration gates.

## [0.3.3] - 2026-10-18

### Fixed
- **No Orphaned Vectors after a Model Switch** (#234): A note keeps one vector, from the model that embedded it last. A
  full re-index now removes the vectors of deleted or excluded notes for every model, including rows from before model
  tracking existed. Before, rows of a previous model and those legacy rows stayed in the database forever. Vectors of
  other models for notes that still exist are kept until the note is embedded with the active model. Keeping vectors
  of several models per note is tracked as an idea in #278.

## [0.3.2] - 2026-10-18

### Changed
- **Stable Note Identity** (#271, ADR-0007): A note with a valid ULID `id` in its frontmatter is now stored under that
  id instead of a key derived from its path. Renaming or moving such a note keeps its vector, 2D position and graph
  edges, also when it happened while Obsidian or MemVector was not running, on another device, or outside Obsidian:
  the next full re-index finds the note by its id and moves the rows without re-embedding. When a note gains or loses
  an `id`, its rows move to the new key the same way. Notes without `id` keep exactly their previous keys, so
  upgrading changes nothing for them. If two notes share an id, the one whose path sorts first keeps it and a warning
  is logged. MemVector does not add or change `id` in your notes. Going back to an older version re-embeds notes with
  an `id` once; no vault file is affected.

## [0.3.1] - 2026-10-18

### Added
- **Optional Writes through Jovian**: New settings "Write through Jovian" (`writeViaJovian`, default off) and
  "Jovian command" (`jovianCommand`) with a "Test gate" button (#274). When on, synthesis notes and relation notes
  (create, edit and the revert after a failed graph write) are written through Jovian's write gate
  (`jovian gate check|write`, protocol 1), which adds its per-file lock, stale check, conflict rescue in
  `.jovian/conflicts/` and a journal line naming MemVector. The path is chosen before each save: when the gate does not
  answer, the note is saved directly with a notice. Once a gate call started, nothing falls back to a direct write; a
  refusal (e.g. the note changed since it was read) shows the existing save error. Relation edits declare the text they
  replace as reviewed, since the user made the edit in the Relation Builder. With the setting off nothing changes, and
  MemVector keeps working without Python or Jovian.

## [0.3.0] - 2026-10-16

From 0.3 on, MemVector is developed together with further private projects, while staying a standalone Obsidian
plugin. Compatibility for existing vaults is kept; please open an issue if an update causes problems. See
`docs/release-notes-0.3.0.md`.

### Added
- **Foundation Relation Labels**: The bundled STEM vocabulary adds `DEFINED_BY`, `USES`, `GOVERNED_BY` and `EXAMPLE_OF`,
  directed and with dedicated edge colors, for the chain concept -> definition -> simpler concept -> primitive notion
  -> axiom (#242). New vaults get them on first use. An existing `wiki/relation-types.json` is not changed: colors and
  layout weights apply right away, the dropdown and the frontmatter keys follow once the terms are added to the file
  (see `docs/CONFIGURATION.md`, section 3.5).
- **Frontmatter Fields in Embeddings**: New setting `embeddingFrontmatterKeys` (empty by default) embeds the values of
  the listed frontmatter keys, e.g. `description, aliases, notation`, before the note body (#251). With the setting
  empty the embedded text is unchanged, so no note is re-embedded; with keys set, only notes that have one of the
  fields are.
- **Note Identity Decision**: ADR-0007 records how notes will be keyed by a frontmatter `id` with the path as fallback
  (#249); the implementation follows in #271.

### Changed
- **Synthesis and Relation Note Frontmatter** (#248):
  - Synthesis notes write `sources` as quoted wikilinks (`"[[wiki/A|A]]"`) instead of raw paths, so Obsidian keeps
    them current on rename, and `generated.by` as `memvector/<provider>:<model>` instead of the bare model name.
  - New relation notes no longer repeat their endpoints in `sources`; the endpoints are in `source_note` and
    `target_note`, and `sources` is reserved for evidence. `generated.by` is `user`, since the Relation Builder
    content comes from the user.
  - New synthesis and relation notes get a stable ULID `id`. MemVector still keys its index by path; keying by `id`
    follows in #271.
  - Existing notes are not migrated. Editing a relation note in the Relation Builder keeps its `id` (or adds one when
    missing), removes only the raw endpoint paths from `sources` and keeps every other entry.
  - Anything outside MemVector that reads `sources` of relation notes as endpoints should read `source_note` and
    `target_note`.

## [0.2.6] - 2026-10-15

### Added
- **Frontmatter Typed Links**: Every lowercase label of the relation vocabulary is read as a typed-link key in note
  frontmatter (`requires`, `equivalent_to`, ...), and `<label>_suggested` as an unconfirmed suggestion (#243). A
  relation note and a frontmatter link for the same edge count once; the relation note wins. Suggestions are drawn
  dashed and stay out of layout forces, the graph index and synthesis context. Clicking a frontmatter edge opens its
  note instead of the relation builder.
- **Background Vault Indexing**: Graph store and vector index keep current on vault changes (create, modify, delete,
  rename) in the background, independent of whether the 2D view is open (#250).
- **Clean Canvas Decluttering**: Redundant uppercase topic cluster headers (`CLUSTER (count)`) were removed from the 2D
  scatter view for a distraction-free thinking canvas and conflict-free note label placement.

### Fixed
- **Preserve Foreign Frontmatter on Relation Edits**: Editing a relation note preserves unknown frontmatter fields
  (e.g. `id`, custom properties, tags) and custom body content outside the generated section instead of rewriting the
  entire note from scratch (#246).
- **Safe Frontmatter Serialization**: Synthesis notes and relation notes are written via a shared YAML serializer
  (`stringifyYaml`) instead of string interpolation, preventing invalid YAML when note titles or descriptions contain
  quotes, colons, hashtags, or line breaks (#247).
- **Asserted Edges Survive Relation Edits**: Deleting a relation note, or changing its type or direction, no longer
  removes the old edge from the graph index while another relation note or a confirmed frontmatter link still asserts
  it. If the vault cannot be read at that moment, the edge is kept until the next full re-index (#254).
- **Relation Edits With Unreadable Relation Notes**: If another relation note cannot be read or is incomplete, the
  old edge is kept as well, because that note may still assert it (#258).
- **WikiLinks Setting Help**: The description of "WikiLinks as graph relations" now states that WikiLinks always
  raise the 2D similarity of linked notes and that the setting only controls `LINKS_TO` edges (#256).

## [0.2.5] - 2026-10-14

### Added
- **Relation Weight Cap Notice**: Entering a relation weight above the 2D layout's attraction cap in the relation
  type table or the add form keeps the value and shows a notice that the attraction saturates there. The cap is
  `MAX_RELATION_WEIGHT_FACTOR` in `layoutTunables.ts`, shared by the layout and the settings.
- **Runbook**: `docs/runbook.md` covers the npm scripts, the committed `main.js` and its CI check, linking the
  build into a vault, the mock echo server and the release steps.

### Changed
- **One Vector Pipeline**: "Index vault locally now" and the 2D view's "Calculate vectors" share
  `src/sync/vectorPipeline.ts`. A failed note is skipped and reported; a run aborts on a failing first request or
  after 3 consecutive errors and still writes what it calculated; reconcile runs after every non-aborted run. The
  toolbar now reports partial runs as `[WARN]` instead of stopping at the first error (Plan 0004).

### Fixed
- **Relation Save Atomicity**: If a relation's graph edge cannot be written, a newly created relation note is
  trashed and an edited one gets its previous content back. Other entries of a batch stay saved; the notice names
  the relations that failed.
- **Label Priority**: Selected and hovered labels always draw; labels of connected neighbors yield to them and to
  each other before all other labels.
- **Culling**: Edges are culled by their whole curve and nodes by their label reach, so fanned edges and partly
  visible labels no longer disappear at the screen edge.
- **Documentation**: README, CONFIGURATION and the 0.1.7 audit and release notes corrected where they deviated
  from the code.

## [0.2.4] - 2026-10-09

### Fixed
- **Fingerprint-Scoped Vector Reconcile**: `SqliteVectorStore.reconcile` now only reads and deletes rows of
  its own embedding fingerprint, so a reconcile no longer removes vectors stored by another model (#229).
- **Partial Index Outcomes**: Embedding failures of individual notes (e.g. rate limits) are recorded in
  `VectorSyncResult` (`failedCount`, `failedPaths`). "Index vault locally now" reports `[WARN]` with the
  number of skipped notes instead of `[OK]`, and logs their paths to the console (#230).

### Changed
- Added localized `indexVaultPartial`, `indexVaultNoticePartial` and `indexVaultNoticePartialSavedSuffix`
  strings in English and German.

## [0.2.3] - 2026-10-02

### Fixed
- **Vectorless Note Layout Hardening**: Rescale similarity bounds are now computed strictly from pairs of
  notes with valid embeddings when >= 2 exist, preventing un-embedded notes from distorting global matrix
  scaling or collapsing to the origin. Bounds default safely for 0-1 embedded notes (#224).
- **Centroid Selection for Small Sets**: Cluster centroid selection (`assignClusters`) prioritizes embedded
  notes even when note count n <= numClouds, preventing un-embedded notes from anchoring clusters.
- **Camera Refit on Relation Removal**: Deleting a relation triggers a deterministic global rearrangement
  and automatically refits the camera (`fitToView`), ensuring the graph remains centered in view (#218).
- **Centralized Deletion Pruning**: Centralized `pruneDeletedNodes()` before all layout passes, eliminating
  ghost nodes and origin stacks from deleted notes across view operations.
- **Deterministic Sort Tiebreaks**: In `layoutEngine.mobileSet`, note ID comparison provides an explicit
  tiebreak when similarity scores match.
- **Graph Retrieval Unindexed State**: The SQLite graph store checks `isIndexed()`, accurately reporting
  unindexed graph states and rendering localized warnings instead of falsely reporting `ready` (#192).
- **Radar Heuristic Fallback**: Radar signals `unindexed` and activates word/formula heuristic ranking
  when candidate vault notes lack vector embeddings (#193).
- **Cross-Machine Determinism**: Standardized all string comparisons and search tiebreaks to explicit `"en"`
  locale, preventing platform- and host-locale-dependent sorting divergence (#195).
- **Reasoning Token Preservation**: Incomplete reasoning blocks lacking `</think>` tags are retained in the
  callout rather than crashing parsing (#198).
- **Workspace State Restoration**: Saved scatter filters are restored smoothly without redundant rescans (#194).

### Changed
- Standardized all `localeCompare` calls to explicit `"en"` locale.
- ADR-0006 updated to clarify scratch global rearrangement upon relation deletion and hybrid force modeling.
- Added localized `retrievalGraphUnindexed` warning for unindexed graph database in English and German.

## [0.2.2] - 2026-10-01

### Added
- **Rearrange Layout Action**: A "Layout neu anordnen" / "Rearrange layout" button in the view section of
  the toolbar and the command "MemVector: Rearrange 2D layout" compute a fresh global layout. Data
  updates no longer rearrange the map on their own (#214).
- **Mock Server Delay**: `testing/mock-echo-server.js --delay <ms>` holds embedding and chat responses,
  so cancelling indexing on a model switch can be tested manually.

### Fixed
- **Layout Only on Relevant Changes (ADR-0006)**: The 2D view compares signatures of its layout inputs
  and skips simulation and position writes when nothing relevant changed; reopening the view shows
  stored positions unchanged (#206, #209).
- **Map Drift**: A relevant change runs a bounded adjustment that moves only the changed notes, their
  relation neighbors and their most similar notes, instead of re-heating the whole simulation (#185).
- **Event Handling**: Vault events are coalesced per file, a change re-reads only that note, events for
  excluded or filtered notes are ignored, and scans no longer overlap (#210).
- **Position Writes**: Only moved positions are written, batched, and flushed on close; failed writes
  are retried (#211).
- **Hidden Views**: Views in background tabs collect changes and apply them once when shown (#212).
- **Origin Nodes**: An explicit placement flag replaces the `(0, 0)` "unplaced" sentinel (#190).
- **Relation Notes Toggle**: Turning relation notes on shows them immediately (#204).
- **Incomplete Relation Notes**: A relation note without a usable source or target no longer causes its
  stored edge to be deleted during graph sync (#203).
- **Model Switch During Indexing**: "Calculate vectors" and "Index vault locally now" are cancelled when
  the embedding model or endpoint changes mid-run (#202).
- **Failed Vector Read**: The map is kept, no positions are written and a notice is shown until the
  vectors can be read again; fallback vectors must belong to the current model (#191).
- **Stale Context and Orphaned Positions**: Vector-search context uses the current note body; positions
  of deleted or excluded notes are removed by full re-index runs (#196).
- **Settings Propagation**: Exclusions, knowledge domain, WikiLinks as relations and spacing reach open
  views immediately (#189).

### Changed
- **ADR-0006 supersedes ADR-0005**: Positions are kept for unchanged layout inputs, relevant changes lead
  to a bounded adjustment, and a full rearrangement is an explicit action. The 0.2.1 release notes
  overstated "full spatial mental map continuity"; 0.2.2 delivers it.

## [0.2.1] - 2026-09-30

### Added
- **Mental Map Continuity across Restarts (ADR-0005)**: 2D scatter node positions are now persisted
  to local SQLite (`node_positions`) and restored when reopening the canvas, preserving the user's
  spatial memory across restarts (#182).
- **Edge Radius Persistence**: The edge hops radius dropdown state is persisted across workspace
  sessions and settings updates.

### Fixed
- **Canvas Layout Collapse on Edge Addition**: Adding a new relation edge previously dragged
  connected components together into a dense clump until vectors were recalculated. Multi-hop
  topology decay (`HOP_DECAY`) was reduced to stay below the spring attraction threshold (0.15),
  and relation notes in `wiki/relations/` are excluded from the canvas node set when
  `showRelationNotes` is disabled (#200).
- **Edge Deletion Protection Gate (`reconcileEdges`)**: Skip destructive edge reconciliation if
  loading relation notes fails or encounters partial file read locks, preventing transient file
  system errors from wiping SQLite graph edges (#183, #197, #199).
- **Position Persistence Protection Gate (`positionsHydrated`)**: Position writes to SQLite are
  blocked if hydration failed, and in-memory coordinates from failed hydrations are discarded on
  subsequent scans to prevent deferred coordinate clobbering (#184, #198, #199).
- **Deterministic 2D Orientation**: SVD sign-flip canonical normalization on PCA projection axes
  ensures reproducible orientation of the 2D layout without coordinate reflection flips (#182).
- **Incremental Placement for Unplaced Notes**: Newly added notes are seeded next to their highest
  similarity neighbor rather than disturbing settled nodes in the graph (#182).

### Changed
- **Relation Builder Dropdown**: Removed the ad-hoc "Frei..." / `CUSTOM` free-text option from the
  Relation Builder modal. Relation types are now configured and managed exclusively via relation
  presets and Settings (#200).

## [0.2.0] - 2026-09-30

### Added
- Settings -> General -> **Vault folders**: the folders for relation notes
  (`relationsFolder`), synthesis notes (`synthesisFolder`) and vocabulary presets
  (`presetsFolder`) are configurable. Defaults stay `wiki/relations`, `wiki/synthesis` and
  `wiki/presets`, so existing vaults are unchanged; changing a folder does not move existing
  notes. The relations folder is also the fallback criterion for relation notes without
  `type: relation`. Texts that named the fixed `wiki/...` folders now show the configured
  ones (#173).

### Fixed
- "Index vault locally now" (Settings) and "Calculate Vectors" (2D view) now embed the same
  text and compute the same cache hash. Settings used the file name plus up to 1500
  characters, the toolbar used the display title plus an 800-character scan excerpt, so
  each path treated the other's stored vectors as stale and re-embedded unchanged notes.
  Both now build the text through one shared function from the note file itself (#161).
- Switching the embedding model or endpoint no longer mixes vectors from different
  models. The cache compared only the content hash, so unchanged notes kept their old
  model's vectors and search compared incompatible vector spaces. Each vector now
  records the model and endpoint that produced it; other models' vectors count as cache
  misses and are excluded from search, hydration and the radar (#164). Vectors stored by
  earlier versions carry no record of their model, so they are treated as unknown rather
  than attributed to the currently configured one: the first indexing run after the
  update re-embeds every note, and until then search and the radar skip them (#176).
- An open 2D view no longer keeps vectors of the previous embedding model. Changing the
  model or endpoint, and every "Index vault locally now" run, reloads the stored vectors into
  open views; "Calculate Vectors" takes the stored vector on a cache hit even when the
  view still holds one, and GraphRAG context enrichment builds its query only from stored
  vectors. Before, a stale in-memory vector could silently search the new model's index (#175).
- The embedding fingerprint no longer treats endpoints whose URL paths differ only in case
  (e.g. `/ModelA/v1` and `/modela/v1`) as the same vector space; only scheme and host are
  compared case-insensitively (#177).
- Relation notes are recognized by one rule everywhere (edges, graph index, GraphRAG,
  scatter nodes, vault watcher, radar): frontmatter `type: relation`, or a note inside
  the relations folder (default `wiki/relations/`). Moved relation notes and a top-level `relations/` folder now work;
  ordinary notes in an unrelated folder named `relations` without the type are no
  longer treated as edges. See ADR-0004 (#173).
- "Calculate Vectors" in a filtered 2D view no longer deletes the stored vectors of
  every note outside the filter. Index cleanup compared the stored vectors against the
  filtered node list; it now compares against every indexable note in the vault (#165).
- A retry after a failed database write no longer reports success for vectors that were
  never saved. The failed vectors stayed in memory, so the retry saw them as cached and
  wrote nothing. Changes a failed write left behind are now tracked, and both indexing
  paths write them to disk before reporting success, or report the storage error again (#166).
- A live vault update during "Calculate Vectors" no longer aborts the calculation with
  `Cannot read properties of undefined` and leaves the button disabled. The loop now
  works on a snapshot of the notes, hands the results to the refreshed notes by path,
  and re-enables the button and reports the error on any failure. Notes deleted in the
  meantime are skipped and no longer counted as cached in the success message (#169).
- An open 2D view now picks up vectors re-indexed elsewhere (Settings, another view, a
  model switch) on its next rescan. It used to copy its previous in-memory embeddings onto
  the rescanned notes and only filled gaps from the database; the stored vectors now take
  precedence, and in-memory ones are kept only if the database cannot be read (#167).
- Editing a note no longer makes the 2D view jump back to the full overview. Background
  rescans from the live vault watcher keep the current pan and zoom; opening the view and
  changing the view filter still fit the camera (#162).
- Changes to the active relation vocabulary file made outside the Settings table (by hand
  or by sync) now reload the relations and layout weights of an open 2D view (#162).
- Creating, deleting or renaming a relation note now updates the relation-note nodes of an
  open 2D view. The watcher only reloaded edges, so with "show relation notes" on, deleted
  relation notes stayed on the canvas and new ones did not appear (#168).
- A rescan now aligns the selection, hover and search state with the current notes.
  Deleted notes stayed counted in the selection, and repeating a search panned to the
  note's position from before the rescan (#171).
- Creating a preset while the active vocabulary is intentionally empty now creates an
  empty preset. The file reader could not tell an empty vocabulary from a missing one, so
  the new preset was seeded with the 13 STEM types; only a missing or unreadable active
  file falls back to STEM now (#170).
- The form for adding a relation type in Settings is now the last row of the type table,
  each field under its column (label, category, weight, bidirectional, repels, add). It used
  to be a wrapping flex row that broke mid-form in a narrow settings pane and aligned with
  nothing above it; the reset button now sits right-aligned below the table.

### Changed
- The embedded text per note is no longer limited to 800-2000 characters by three
  independent hardcoded cuts. A single setting, `embeddingMaxChars` (default 8000,
  0 = no cap), controls it; the fixed 2000-character cut inside the embedding request
  is removed. Longer notes are re-embedded once with more of their content (#161).

## [0.1.8] - 2026-09-29

### Fixed
- The 2D view now schedules its animation frames on the window it actually lives in.
  Both the redraw throttle and the search pulse used a bare `window.` prefix, which
  resolves to the window the plugin was loaded in, so a view dragged into an Obsidian
  popout scheduled frames on - and cancelled them against - a window it no longer
  belonged to. The window-level `mouseup` listener follows the canvas across a move as
  well (#137).
- Every way of changing the active relation vocabulary now reaches an open 2D view.
  Deleting, creating or renaming a preset, and editing the vocabulary path, updated
  the settings while the open canvas kept laying out with the previous vocabulary.
  The path field is also applied on blur or Enter instead of on every keystroke, so a
  half-typed path can no longer be persisted or turned into a stray vault file, and
  table edits are written to whichever file is active at that moment rather than the
  one that was active when the table was drawn (#135).
- User presets can no longer take a bundled preset's name. `createPreset` and
  `renamePreset` checked only whether the target file already existed, so a preset
  named e.g. "Law" was accepted while `wiki/presets/law.json` was still absent and
  was then listed under the bundled label, beyond rename or delete (#140).
- The context preview no longer prints the untranslated word `seed` next to a selected
  note. Its origin was already stated by the localized badge, so the duplicate marker is
  removed rather than translated; traversed rows keep their compact `v` / `g` / `v+g`
  provenance codes (#141).
- Adding a relation type through the Settings add form now keeps explicit default
  values. Adding a label that ships bundled layout semantics with weight `1.0` or
  `repels` unticked dropped both fields, so the inheritance fallback restored the
  bundled values on the next load - `CONFLICTS_WITH` came back repelling and
  `EQUIVALENT_TO` at 1.3. Both write paths now use the same serialization (#136).
- Relation type edits in Settings no longer discard each other. Every vocabulary
  mutation now re-reads the file before writing, so a second weight/repels edit,
  a delete or an add keeps all previous edits; an unreadable file aborts the
  write instead of truncating the vocabulary (#133). Each control writes only the
  field it owns and the whole read-modify-write runs atomically through the vault,
  so a `repels` change committed elsewhere is no longer reverted by the next weight
  edit, and two open Settings tables no longer overwrite each other.
- Relation weights above `1.0` now actually shorten the distance between connected
  notes. The force simulation clamped every graph weight to `1.0`, so the bundled
  `EQUIVALENT_TO` (1.3) and `ANALOGOUS_TO` (1.1) and any custom weight produced
  exactly the same layout as a generic relation. Weights at or below `1.0` keep
  their previous placement unchanged; see ADR-0003 for the mapping (#134).

## [0.1.7] - 2026-09-28

### Added
- Custom relation edge types, presets, and vocabulary-driven layout weights (#119, PR #121).
- Bundled domain presets under `wiki/presets/` (STEM, Law, Medicine, Philosophy) with a Settings **Relation types** manager: preset switch/create/rename/delete, a per-label type table with in-place `weight`/`repels` editing, add/remove, and reset to the STEM default (#119, PR #121).
- Typed knowledge relation edges injected directly into GraphRAG LLM prompt context (#104, PR #128).
- Sticky seed notes pinned at the top of the context preview (#117, PR #123).
- Manual dismissal controls (`x`) on context preview items allowing users to prune unwanted vector or graph notes before launching LLM synthesis (#116, PR #124, PR #126).
- Greedy screen-space collision avoidance (`labelPlacement.ts`) for 2D scatter plot to declutter dense cluster and node labels (PR #130).
- Setting **Show relation notes** (`showRelationNotes`, default `false`) replacing the former toolbar toggle (#119, PR #121).
- CI step verifying that the committed `main.js` bundle matches the current source, so a source change cannot ship with a stale artifact.

### Changed
- Removed hidden internal SQL neighbor caps and slack multipliers from graph traversal queries, strictly honoring user-configured hop limits and context budgets (#115, PR #122).
- Widened floating toolbar to 280px and pinned context preview dismiss buttons to the far right for clean alignment and usability (PR #126).
- Slimmed the floating 2D toolbar: relation edges are always rendered and the toolbar keeps only the hop radius. The **Lasso**, **Show edges**, **Show relation notes**, **Visual style** and **Agent guidelines** toggles were removed from it; visual style, relation-note visibility and agent guidelines moved into plugin Settings, and lasso selection is now the `Shift` + drag gesture only (#119, PR #121).
- Relation edges are shown by default (`showEdges`), relation *notes* are hidden by default (`showRelationNotes`) - the graph now reads as typed connections between concept notes rather than as relation files on the canvas (#119, PR #121).
- Settings sections reordered to match their numbering; the relation vocabulary path field moved into the collapsible **Relation types** section (#119, PR #121).
- Bundled relation vocabulary slimmed from 37 conversational synonym entries to exactly one entry per canonical label (13). The dropdown selects canonical labels, so existing relation files and edges are unaffected; the work-in-progress `buildConversationalCategories` scaffolding for Issue #43 was removed with it (#119, PR #121).
- Visual style, relation-note visibility and label opacity now take effect immediately in an open 2D view, and every relation-vocabulary change (type add/remove, weight/repels edit, reset, preset switch) re-runs the force layout there, instead of requiring the view to be reopened.
- Relation prompt heading and reason label now come solely from the i18n layer; the duplicated inline copies in `synthesis.ts` were removed.

### Fixed
- Eliminated GPU compositing artifacts / text bleeding into unrelated Obsidian panes (tab bar, file explorer) on macOS by removing toolbar `backdrop-filter: blur` and throttling canvas redraws via `requestAnimationFrame` (PR #130).
- Fixed remaining hardcoded UI strings in toolbar and sidebar views by routing them through the i18n layer (#111, PR #127).
- Preserve bundled per-label layout semantics (`weight`/`repels`, ADR-0002) for vocabulary files written before those fields existed and for labels missing from the active preset, instead of silently collapsing every label to the generic `1.0` attraction - which turned `CONFLICTS_WITH` from repulsion into attraction and `INDEPENDENT_OF` from the neutral `0.05` baseline into a full pull, re-breaking #68 (`relationVocabulary/layoutDefaults.ts`).
- Bidirectional relations saved from the Relation Builder now store a reverse edge row like the full re-index path, so reverse-hop traversal works without a manual re-index (#120, PR #121).
- Skip non-finite vector similarity scores during GraphRAG context enrichment instead of admitting them as matches (PR #127).
- Correct `isRelationNode` path matching so sibling folders such as `wiki/relations-archive/` are no longer misclassified as relation notes (PR #127).
- Scope the canvas redraw throttle to `window.requestAnimationFrame` and cancel the pending frame in the interaction teardown, so the 2D view keeps redrawing in an Obsidian popout window and a scheduled frame cannot fire after the view closed (PR #130).
- Selected, hovered and connected node labels now reserve their space before all other labels, so the label the user is focused on is no longer overdrawn by an arbitrary neighbor's (PR #130).
- Long note titles in the context preview now ellipsize instead of pushing the meta column and dismiss button out of the toolbar panel.
- The context preview reset button stays reachable when context enrichment fails, so dismissed notes can always be restored.
- Removed the orphaned translation keys left behind by the toolbar slimming (`lblLasso`, `lblShowEdges`, `lblVisualStyle`) and wired up the two that were added but never used (`synthRelHeading`, `synthRelReasonLabel`).
- Routed the last hardcoded strings in the synthesis path through i18n: the context-search status line, the context preview's hop wording, and the model-reasoning callout title.

### Performance
- Label collision detection uses a uniform screen-space grid instead of a linear scan over every placed rect, so dense vaults no longer pay a quadratic cost on each animation frame during pan and zoom (PR #130).

### Documentation
- `ADR-0002`: vocabulary-driven layout weights, including the bundled-default fallback and the in-place weight/repels editing (`docs/adr/0002-vocabulary-driven-layout-weights.md`).
- Audit of the 0.1.6 -> 0.1.7 commit range against its own claims, with every finding and its fix (`docs/audits/0.1.7-release-audit.md`).
- Updated `README.md` (version and test badges, per-type force editing, lasso gesture), `docs/ARCHITECTURE.md` (vocabulary-driven weights, lasso gesture, legacy graph-backend wording), `docs/USER_GUIDE.md` and `docs/CONFIGURATION.md`.

## [0.1.6] - 2026-09-26

### Added
- Opt-in setting `includeWikiLinksAsRelations` (default: `false`) under Knowledge Domain & Embedding Provider that makes WikiLink `LINKS_TO` graph relations opt-in (#100, PR #101).
- Quick toggle in 2D scatter plot toolbar under View to show or hide relation notes without layout reset (#59, PR #99).
- Per-hop GraphRAG context quotas (`hopLevelNeighborLimit`, default `2`, `0` = unlimited per level) and round-robin assembly across hop levels (#103, PR #105).
- Live scrollable context preview with compact badges (`v`, `g`, `v+g`, score, hops) and real-time similarity slider in the toolbar Synthesis section (#103, PR #105).
- Independent GraphRAG hop depth control (1–3 hops) in the toolbar Synthesis section (#89, PR #98).
- Settings-based context limits for vector neighbors, total context, and guideline caps (#103, PR #105).
- `ADR-0001`: Architectural decision record on opt-in WikiLink relation extraction (`docs/adr/0001-wikilinks-opt-in-graph-relations.md`).

### Changed
- GraphRAG neighbor assembly now respects per-hop quotas rather than cutting off deeper hops prematurely (#103).
- GraphRAG hop depth is now configured in the toolbar Synthesis section, decoupled from visual canvas edge hops (#89, #103).
- SQLite storage path now resolves from `this.manifest.dir` with automated directory creation before write (PR #97).
- Canvas node position provider formalized as `NodePositionProvider` interface (#78, PR #94).
- Model tier routing now includes `deepseek-reasoner` and OpenRouter frontier endpoints (#83, PR #96).
- Removed hardcoded model-tier context budgets in favor of user-configurable settings (#103).

### Fixed
- Fixed SQLite database and WASM initialization failing with ENOENT when plugin folder name diverges from manifest ID (PR #97).
- Fixed dual-identity discrepancy for vector IDs across store boundaries (#81, PR #92).
- Fixed caller array mutation in `RelationBuilderModal` (#83, PR #96).
- Fixed canvas listener leaks by registering clean interaction teardown on view close (#83, PR #96).
- Fixed hardcoded UI strings, error notices, and toolbar labels across the plugin by routing them through the i18n layer (#69, PR #93, PR #106).
- Fixed lost relation edits and added validation for default types and duplicate filenames (#90).
- Preserve stored relation direction when editing a canonical type with `reversed: true`, while retaining explicit direction swaps (#90).
- Resolve preselected relation type through the vocabulary even without dropdown interaction, including reversed and bidirectional defaults (#90).
- Check all existing relation files for save conflicts before graph-edge deduplication, including excluded files and duplicate legacy identities (#90).

### Documentation
- Documented `ADR-0001` for opt-in WikiLink relation extraction in `docs/adr/0001-wikilinks-opt-in-graph-relations.md`.
- Updated `README.md`, `docs/ARCHITECTURE.md`, `docs/CONFIGURATION.md`, and `docs/GRAPHRAG.md`.

## [0.1.5] - 2026-09-23

### Fixed
- Honor reversed direction and accurate originalTerm resolution for relation definitions in save pipeline, and align vocabulary documentation (#70).
- Treat `INDEPENDENT_OF` relations as neutral baseline graph weight instead of strong attraction in 2D force layout (#68).
- Precompute note token sets in O(N) instead of O(N^2) pairwise re-tokenization, and eliminate inner-loop string allocations during 2D force layout (#80).
- Eliminate redundant similarity matrix rescaling inside 2D force layout projection, preserving single-ownership and caller-provided affinities (#75).
- Add SHA-256 identity suffixes to bounded relation filenames to distinguish folder/punctuation collisions, while preserving legacy paths for edits and duplicate detection (#74).
- Save replacement relation files and graph edges before deleting previous data; reject duplicate batch targets and prevent create races from overwriting other relations (#73).
- Enforce exclusion rules in GraphRAG context enrichment, preventing excluded notes from polluting prompt context (#82).
- Render distinct, semantic palette colors for relation types in 2D scatter plot across default ("ink") and "muted" visual styles, with dedicated colors for all 13 canonical Cypher relation labels (#62).

### Documentation
- Document canonical Cypher relation labels in active dropdown and conversational phrase mapping in buildConversationalCategories as planned Issue #43 expansion (#70).
- Correct unsubstantiated 15x math weighting claim, align layout force equations and initial PCA placement descriptions with implementation, fix custom endpoint defaults and setting section order, and update version and test count badges (#67, #68, #71).

## [0.1.4] - 2026-09-16

### Added
- Organic 2D manifold simulation and force-directed layout with PCA/spectral initialization and simulated annealing cooling, replacing rigid circular carousel anchors and frozen phyllotaxis spirals (#41, #42).
- Dynamic similarity matrix rescaling (`rescaleSimilarityMatrix`) stretching off-diagonal cosine similarities to `[0, 1]`, restoring organic semantic cluster separation on the canvas (#39, #40).
- 13 canonical Cypher relation types (`IMPLIES`, `EQUIVALENT_TO`, `CONFLICTS_WITH`, `INDEPENDENT_OF`, `REQUIRES`, `GENERALIZES`, `SPECIALIZES`, `EXTENDS`, `REDUCES_TO`, `CONSTRUCTS`, `EMBEDS_IN`, `REFUTES`, `ANALOGOUS_TO`) directly exposed in the relation builder dropdown without lossy synonym projection (#43, #44).
- GitHub Actions CI workflow (`.github/workflows/ci.yml`) and Pull Request template (`.github/PULL_REQUEST_TEMPLATE.md`) for automated typecheck, lint, test, and bundle verification on PRs and default branch pushes (#21, #53).
- Conflict guard (`findRelationPathConflict`) in relation builder modal preventing silent overwrites of user notes or metadata on edge type modifications (#14, #50).

### Fixed
- Fetch fresh note body from vault for vector neighbors during GraphRAG context enrichment instead of using truncated canvas previews (#15, #46).
- Decouple transient canvas view filter (`viewFilterQuery`) from persistent indexing exclusions, removing confusing preset domain filters from settings (#45, #47).
- Surface SQLite persistence failures as visible `[ERROR]` notices in the canvas toolbar while suppressing misleading `[OK]` status, and add comprehensive test coverage simulating persistence failures and reconcile rejections (#9, #48, #55).
- Fully localize settings action buttons (API testing, vault indexing), scatter toolbar tooltips, and sidebar headings across German and English, dynamically updating UI on language switch (#55).
- Remove 7 obsolete projection mode references from user documentation and clean orphaned translation keys (#38, #49).
- Ensure injective note IDs in `pathToId()` across directory paths and special characters via URI encoding, preventing collisions across folders and naming variations (#12, #51).
- Pass exclusion patterns to graph sync and allow full zero-state database reconciliation when files or notes are deleted (#10, #52).
- Clarify Path & File Exclusions description to accurately describe global scope across vector indexing, graph sync, and 2D Graph, and clean agent guideline defaults to `AGENTS.md` (#57).
- Match relation edges case-insensitively across force layout topology weights, canvas edge rendering, hit-testing, and hop reachability, ensuring newly created or capitalized relations immediately update graph physics and visual connections (#58).
- Document data safety status and residual risks regarding relation overwrite and exclusions in README and release documentation (#36).

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
