# MemVector Knowledge Engine — System Architecture

**Version:** 0.1.5
**License:** MIT

---

## 1. Overview

**MemVector Knowledge Engine** is a local-first, privacy-focused Obsidian plugin designed to visualize, search, and synthesize complex Markdown knowledge vaults using **2D Vector Embeddings**, a **Local Graph & Vector Database** (powered by local SQLite via `sql.js`), and **Large Language Models (Ollama, Anthropic Claude, OpenAI, DeepSeek, OpenRouter)**.

The plugin is domain-agnostic: it ships with a STEM (math/formal-sciences) example configuration - a 17-label relation vocabulary and LaTeX-aware embedding weighting - but nothing about the storage layer, the relation types, or the LLM prompts assumes mathematics specifically. See §2.6 for how the relation vocabulary is externalized to a vault file rather than hardcoded.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           OBSIDIAN WORKSPACE                            │
│                                                                         │
│   ┌──────────────────────────┐         ┌────────────────────────────┐   │
│   │   Active Markdown Note   │         │  Sidebar Mini-Radar View   │   │
│   │  (LaTeX, Links, Content) │◄───────►│  (Polar 2D Cutout Framing) │   │
│   └─────────────┬────────────┘         └─────────────┬──────────────┘   │
│                 │                                    │                  │
│                 ▼                                    ▼                  │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │               MemVector 2D Graph View (Canvas)                  │   │
│   │        Interactive Panning, Smooth Zoom, Topic Clustering       │   │
│   └─────────────────────────────────┬───────────────────────────────┘   │
└─────────────────────────────────────┼───────────────────────────────────┘
                                      │
                                      ▼
             ┌─────────────────────────────────────────────────┐
             │       Organic 2D Force Layout (projections.ts)  │
             │   - 2D PCA / Spectral Initialization            │
             │   - High-Dimensional Vector Similarity Blend    │
             │   - Graph Topology BFS (Hops & Semantic Types)  │
             │   - Anti-Collision Clearances                   │
             └────────────────────────┬────────────────────────┘
                                      │
                                      ▼
             ┌─────────────────────────────────────────────────┐
             │       Local Graph & Vector Engine (SQLite WASM) │
             │  - memvector-local.sqlite (Pure WASM via sql.js)│
             │  - Nodes, Edges, 1536d / 1024d Vector Storage   │
             │  - Zero Docker, Zero Network Call for Storage   │
             └────────────────────────┬────────────────────────┘
                                      │
                                      ▼
             ┌─────────────────────────────────────────────────┐
             │         Hybrid GraphRAG Synthesis Engine        │
             │   - Multi-Hop Graph Traversal                   │
             │   - Semantic Vector Neighbor Enrichment         │
             │   - LLM Synthesis: Ollama, Claude, OpenAI, etc. │
             └─────────────────────────────────────────────────┘
```

---

## 2. Core Subsystems

### 2.1. Organic 2D Projection Engine
- **Dimensionality Reduction:** Projects high-dimensional embeddings onto a 2D Cartesian coordinate space $(x, y)$.
- **Feature Weighting:** The `knowledgeDomain` setting distinguishes between **General Knowledge Vaults** (PKM, research, code) and **Mathematical Vaults** (LaTeX definitions, theorems, proofs) - a user choice, not a fixed mode. `general` is the default for new installs.

#### Layout Algorithm (`layout/projections.ts`)

`applyGraphVectorProjection` runs four steps: `buildRepelMask` (pairs joined by a repelling relation), `placeInitial` (PCA, else the matrix projection, else a spiral) or `placeIncremental` (new notes next to their most similar placed note), then `simulateForces`, which moves each node right after summing its forces. Golden snapshots in `layout/projections.golden.test.ts` pin the exact output.

There is currently one layout algorithm, `graphvector`, applied directly via `applyGraphVectorProjection`. It's a single force simulation that already blends what used to be several separate modes:

- **Initial placement:** Fast 2D PCA power iteration projection (`compute2DPcaProjection`) aligns the primary variance axes of high-dimensional embeddings directly onto the canvas, with spectral matrix projection and golden-spiral origin distribution as deterministic fallbacks for un-embedded notes.
- **Semantic clustering (`assignClouds`):** Groups nodes with high similarity into semantic cloud clusters for category coloring and contextual grouping.
- **Hybrid similarity attraction:** Pairwise affinity computes a non-linear maximum between topological weight and quadratic semantic similarity (`Math.max(topWeight, Math.pow(sim, 2))`), pulling similar and well-connected notes toward an ideal distance while filtering out background noise.
- **Graph-topology weighting** (`graphTopologyWeights.ts`, see below): Typed relations and - only when opted in - WikiLinks shape the attraction/repulsion beyond raw similarity.
- **Collision clearance:** A hard minimum-distance push keeps dots and labels from overlapping regardless of the above.

An earlier version of this plugin exposed several independently selectable projection algorithms (clustered force, plain force, a flow-rank layout, a UMAP-inspired layout, a connectivity-only layout, a formula-clustering layout, and a static LLM-topic-map layout); those were consolidated into the single blended algorithm above. Reintroducing separate selectable modes is possible future work, not a currently planned one.

#### Update behavior (`layout/layoutEngine.ts`, ADR-0006)

The simulation does not run on every data update. `LayoutEngine` compares signatures of the layout inputs (`layout/layoutInputs.ts`) with the last completed pass:

- **Per note:** id, its resolved WikiLink targets while the link weight is above 0, and a hash of the vector while the semantic weight is above 0 (ADR-0008). Title, type, words, formulas and folder are not layout inputs.
- **Global:** the effective force per related note pair (resolved from the vocabulary exactly as the simulation does; description and direction do not count; attracting pairs only while the relation weight is above 0, repelling pairs always) and the three signal weights. Node spacing scales the map and cloud spacing waits for a rearrange (Plan 0005 S4, S5).

Depending on the difference:

- **Nothing changed:** no matrix, clustering, simulation or position write; the kept cluster assignment is re-applied to freshly scanned node objects. On opening the view with stored positions for every note, the signatures and clusters are initialized without a simulation.
- **Local change** (changed, added or re-linked notes, at most half of all notes): a bounded adjustment moves only those notes, their relation (and, when enabled, WikiLink) neighbors and their five most similar notes. All other nodes are fixed. It starts with low energy, anchors existing mobile nodes softly to their previous position instead of pulling toward the origin, and stops once nothing moves. The similarity rescale bounds and clusters of the last free pass are kept; new notes join the nearest existing cluster.
- **Free pass:** settings changes, changes to more than half of the notes, and the spacing sliders run the simulation over all nodes from their current positions and recompute the rescale bounds and clusters. The explicit "Rearrange layout" action does the same from scratch.

If a cluster centroid leaves the node set (e.g. filtered out), only the cluster assignment is recomputed; positions are unaffected. On opening the view with some notes lacking a stored position, the stored ones initialize the state and only the new ones are placed by a bounded adjustment.

Vault events reach the view through one queue (`vaultEventQueue.ts`): events per file are coalesced, a modify re-reads only that note, events for notes outside the view's scope are ignored (relation notes and the vocabulary file excepted), and all node-list updates run serialized so an older scan never overwrites a newer one. A view that is not shown collects vault events and settings changes and applies them once it is visible. Positions are written by `positionPersistence.ts` only when they moved, batched; nodes whose write failed stay pending until a write succeeds, even if a rescan reads the unsaved coordinates back from the in-memory database.

**Signal model** (`layout/signals.ts`, ADR-0008): three pair signals with one source each, mixed only in `combineAffinity`:

1. **Semantic:** embedding cosine, rescaled to [0,1] by the vault's 1st/99th percentile (kept fixed during local adjustments), squared; 0 for a note without a vector.
2. **Link:** 1 when either note links the other in Obsidian's `metadataCache.resolvedLinks` (passed in by the view, refreshed on the `resolved` event).
3. **Relation:** the strongest attracting typed-relation weight between the pair, read from the active vocabulary's `weight` (ADR-0002, bundled fallback for labels the vocabulary does not define, `layoutDefaults.ts`); `repels` labels such as `CONFLICTS_WITH` become a repulsion within `2.5×` node spacing instead.

`a = min(1, w_sem·semantic + w_link·link + w_rel·min(1, relation))` with the weights `layoutWeightSemantic`, `layoutWeightLinks`, `layoutWeightRelations` (0-2, defaults 1 / 0.3 / 1; 0 = off everywhere). A relation weight above 1 also shortens the pair's target distance and stiffens its spring (weight factor, capped at 6). The spring, placement, the notes a local adjustment may move and the clusters all use `a`. There are no hop weights; folder and word overlap are not layout inputs.

### 2.2. Interactive HTML5 Canvas Renderers
- **Main 2D Graph View (`MemVector Graph`):** High-performance HTML5 Canvas supporting panning, smooth trackpad zooming, node hover tooltips, and real-time query filtering.
- **Selectable Visual Styles:** "Monochrome" (neutral dots, color only on selection), "Muted Type Colors" (desaturated per-type colors + one soft glow per cluster), and "Ink & Focus Glow" (outline-only dots; glow appears only on notes connected to the current selection via WikiLink and/or typed relation, weighted by how many of each). No mode renders an always-on additive density heatmap anymore - that turned into visual noise in dense vaults and was replaced by the above.
- **Mini-Radar Cutout View (Sidebar):** Renders a relative 2D cutout view centered at $(0,0)$ on the currently active note, framing the top $X$ nearest vector neighbors with polar distance rings. Neighbors come from a real vector-store lookup (`radarNeighbors.ts`'s `findVectorNeighbors` - fetches the active note's own stored embedding via `VectorStore.getVector()`, then `search()`s against it) whenever the active note has already been synced; it falls back to a local word/formula-overlap heuristic (`activeNoteScoring.ts`'s `rankCandidates`) if not, or if the configured backend is unreachable - never a hard failure.

### 2.3. Multi-Select & Selection State
- **Single Click:** Replaces current selection with the clicked note node.
- **Cmd-Click / Ctrl-Click:** Toggles multi-selection state for targeted nodes.
- **2D view modules:** `VectorScatterView.ts` wires the view, the scans and the layout; `vaultWatchers.ts` decides which vault events reach the view, `nodeHydration.ts` loads stored vectors and positions and keeps the two map gates (#184, #191), `searchController.ts` handles search and its pulse, `canvasInteraction.ts` the mouse gestures with their state in `ctx.interaction` (`context.ts` documents who owns which field). The sidebar radar is `renderActiveNoteFocus.ts` (data and DOM), `radarGeometry.ts` (polar placement) and `radarCanvas.ts` (drawing and mouse).
- **Lasso Tool:** Freehand polygon selection loop - hold `Shift` and drag. There is no separate toolbar toggle (removed in 0.1.7 when the floating toolbar was slimmed down); the gesture is the only entry point.
- **Deselect on Empty Area Click:** Intelligent `wasDragging` threshold prevents accidental selection clearing after dragging or lasso release.
- **Double Click:** Centers camera view and opens the target Markdown file in Obsidian workspace.

### 2.4. LLM Provider Integration
- Fully decoupled, OpenAI-compatible REST API wrapper (`callDirectLLM`).
- Native support for:
  - **Ollama** (Local models: `deepseek-r1:7b`, `llama3`, `mistral`, etc.)
  - **Anthropic Claude** (Native `/v1/messages` endpoint with `x-api-key` and `anthropic-version`)
  - **DeepSeek Cloud** (`api.deepseek.com`, model `deepseek-reasoner` / `deepseek-chat`)
  - **OpenAI** (`api.openai.com`, models `gpt-4o`, `gpt-4o-mini`)
  - **OpenRouter** (`openrouter.ai/api/v1`)
  - **Custom Endpoints** (LM Studio, vLLM, LocalAI)

### 2.5. Pluggable Graph/Vector Storage Architecture

The relationship graph and the vector index sit behind uniform interfaces (`sync/graphStore.ts`'s `GraphStore`, `sync/vectorStore.ts`'s `VectorStore`).

- **Local SQLite Engine (Active in v0.1.0):**
  - **Local Graph Store** (`sqlite/sqliteGraphStore.ts`): zero external dependencies. Notes and edges are stored in `memvector-local.sqlite` in the plugin directory. Multi-hop neighbor lookups are computed using recursive SQL CTEs (`WITH RECURSIVE`).
  - **Local Vector Store** (`sqlite/sqliteVectorStore.ts`): dense BGE-M3 embeddings are persisted in SQLite and cosine similarity search is computed locally in JavaScript. A note has one vector row, from the model that embedded it last (#234); reads and search see only rows of the active embedding fingerprint, while `reconcile` removes rows of every fingerprint whose note is no longer indexable.
  - **Vector pipeline** (`sync/vectorPipeline.ts`): the single embed-write-reconcile path behind "Index vault locally now" (`sync/vaultVectorSync.ts`) and the 2D view's "Calculate vectors" (`views/vectorScatter/toolbar/calcVectors.ts`), so both share error tolerance, persistence and reconcile semantics (plan 0004).
  - **Note keys** (`noteKey.ts`, ADR-0007): every table keys a note by its frontmatter `id` when it is a valid ULID and unique in the vault (uppercased), otherwise by `pathToId(path)`. Duplicated ids stay with the note whose path sorts first; the others fall back to their path key, and the conflict is logged. `sqlite/noteKeyMigration.ts` moves `notes`, `vectors`, `node_positions` and edge ends to a note's current key in one transaction when the note gains or loses an id, or when a note with an id was renamed while MemVector did not see it (checked at the start of every full re-index). Vectors and coordinates are kept, so nothing is re-embedded or re-laid out. Notes the metadata cache has not parsed yet are left alone. When a rename hands a duplicated id to another note, the previous owner's rows move to its path key before the rename moves (`lostDuplicateIdPaths`), and open views re-read every note of a duplicated id on each change batch (#279). MemVector never writes `id` while indexing.
  - **WASM Database (`sql.js`)** (`sqlite/sqliteDb.ts`): runs pure SQLite compiled to WebAssembly, eliminating native binary compatibility issues with Obsidian Electron runtimes. The database is cleanly serialized to `memvector-local.sqlite` via Obsidian's vault adapter.

- **Remote Backends (Planned for v0.2+, see `ROADMAP.md`):**
  - **Memgraph Graph Database**: direct graph queries over the Bolt protocol.
  - **Qdrant Vector Database**: distributed vector search collection for multi-device workflows.

### 2.6. Relation Vocabulary

Relation types are **not hardcoded** in the plugin - they're defined by a plain JSON file in the vault (`relationVocabulary/loadRelationVocabulary.ts`, default path `wiki/relation-types.json`, configurable in Settings). Each entry (`RelationTermDef`, `relationVocabulary/types.ts`) is `{ key, label, term, category, bidirectional, reversed, weight?, repels? }`:

- `label` is the canonical Cypher/graph relationship type (e.g. `IMPLIES`, or `TREATS` for a medical vault) stored in SQLite and note frontmatter. The active Relation Builder dropdown presents canonical Cypher relation labels directly (`buildRelationCategories.ts`) to ensure deterministic, lossless roundtrips when editing existing relations.
- `term` provides the human-readable natural language display phrase for the label (e.g. "implies", "is analogous to").
- `reversed` indicates when a natural phrase reverses graph direction (e.g. "follows from": A follows from B implies B -> A). The save pipeline (`resolveTerm.ts`) honors `reversed: true` for new relations and changed types, including the preselected type. An edit retaining its canonical label preserves the stored direction; the explicit "Richtung umkehren" (swap direction) button still reverses that direction. Preview and save use the same resolution context.
- `weight`/`repels` (optional) drive per-label 2D layout attraction/repulsion, resolved from the vocabulary by `graphTopologyWeights.ts` instead of hardcoded type maps (ADR-0002). The bundled STEM default encodes the previous behavior (`EQUIVALENT_TO: 1.3`, `ANALOGOUS_TO: 1.1`, `CONFLICTS_WITH: repels`, `INDEPENDENT_OF: 0.05`).

If the file doesn't exist yet, it's auto-created on first use of the Relation Builder with a bundled STEM preset (one entry per canonical label, 17 total - `relationVocabulary/defaultVocabulary.ts`) as a starting point. From then on the file is authoritative; the constant is never read again for that vault. Named **presets** (`relationVocabulary/presets.ts`) live in `wiki/presets/*.json` - bundled STEM, Law, Medicine, and Philosophy stubs are written on first activation, and the Settings Relation Type Manager switches/creates/renames/deletes them by repointing `settings.relationVocabularyPath`. Free-text types saved from the Relation Builder are auto-appended to the active file under `"Custom"` (`persistCustomType.ts`). For visual clarity, `drawEdges.ts` maps all 17 canonical relation labels to dedicated semantic colors (`CANONICAL_EDGE_COLORS`) across both ink and muted themes, while dynamically falling back to label string hashing for custom user-defined relation types.
