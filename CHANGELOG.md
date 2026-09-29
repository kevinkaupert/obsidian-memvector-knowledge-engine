# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to pre-1.0 feature/PR versioning (0.x.0 for features, 0.0.x for PRs/fixes).

## [Unreleased]

### Fixed
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
