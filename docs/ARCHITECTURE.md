# MemVector Knowledge Engine — System Architecture

**Version:** 0.1.0
**License:** MIT

---

## 1. Overview

**MemVector Knowledge Engine** is a local-first, privacy-focused Obsidian plugin designed to visualize, search, and synthesize complex Markdown knowledge vaults using **2D Vector Embeddings**, a **Local Graph & Vector Database** (powered by local SQLite via `sql.js`), and **Large Language Models (Ollama, Anthropic Claude, OpenAI, DeepSeek, OpenRouter)**.

The plugin is domain-agnostic: it ships with a STEM (math/formal-sciences) example configuration - a 13-label relation vocabulary and LaTeX-aware embedding weighting - but nothing about the storage layer, the relation types, or the LLM prompts assumes mathematics specifically. See §2.6 for how the relation vocabulary is externalized to a vault file rather than hardcoded.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Obsidian Vault Notes                           │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
             ┌───────────────────────┴───────────────────────┐
             ▼                                               ▼
┌───────────────────────────┐                   ┌───────────────────────────┐
│     2D Vector Engine      │                   │  Local SQLite Engine      │
│  (PCA / UMAP Projection)  │                   │  (memvector-local.sqlite) │
└────────────┬──────────────┘                   └────────────┬──────────────┘
             │                                               │
             ├───────────────────────┬───────────────────────┤
             ▼                       ▼                       ▼
┌───────────────────────────┐ ┌───────────────┐ ┌───────────────────────────┐
│ MemVector Graph (Main UI) │ │ Mini-Radar UI │ │    AI Synthesis Engine    │
│  Right Glassmorphic Panel │ │   (Sidebar)   │ │ (Ollama/Claude/GPT/etc.)  │
└───────────────────────────┘ └───────────────┘ └────────────┬──────────────┘
```

---

## 2. Core Components

### 2.1. 2D Vector Space Engine
- **Dense Vector Embedding:** Vectorizes notes using local embeddings (`bge-m3` via Ollama) or feature-extracted term/formula vectors.
- **Dimensionality Reduction:** Projects high-dimensional embeddings onto a 2D Cartesian coordinate space $(x, y)$.
- **Feature Weighting:** The `knowledgeDomain` setting distinguishes between **General Knowledge Vaults** (PKM, research, code) and **Mathematical Vaults** (LaTeX definitions, theorems, proofs) - a user choice, not a fixed mode. `general` is the default for new installs.

#### Projection Modes (`layout/projections.ts`)

The "Darstellung" dropdown's projection selector switches between 7 independent layout algorithms, all writing into the same `(x, y)` per note:

| Mode (toolbar label) | Basis |
|---|---|
| Themen-Wolken (`cloud`) | Force layout anchored to cluster centroids, driven by the full hybrid similarity matrix (vector + WikiLinks + folder + LLM semantics, per user-configurable weights). |
| Abhängigkeits-Fluss (`flow`) | Static vertical rank by note type (definition → theorem → concept, etc.), no force iteration. |
| Reiner Graph (`graph`) | Force layout driven only by the hybrid similarity matrix, fixed 120px ideal distance - no clustering, no type-based rank. |
| UMAP Manifold (`umap`) | k-nearest-neighbor attraction + non-neighbor repulsion, approximating UMAP's local/global structure trade-off without pulling in the real `umap-js` dependency. |
| Graph-Topology (`graphTopology`) | Connectivity-only force layout - **not** real Node2Vec (no random walks/skip-gram), despite the resemblance in spirit. See below. |
| Formel-Symbole (`formula`) | Clusters by which family of LaTeX operators (∀, ∃, ∑, ⟹, ...) dominates a note's content. |
| LLM Themen-Landkarte (`semantic`) | Static radial placement around `cloudId`-derived anchors (topic names from the LLM-based cloud-naming mode), no force iteration. |

**Graph-Topology in detail** (`graphTopologyWeights.ts`): unlike every other mode, this one ignores vector similarity entirely and lays notes out purely by how they're *connected*.

1. Builds an undirected graph from WikiLinks (`[[...]]`) and typed Memgraph relation edges (`wiki/relations/*.md`).
2. Runs a BFS from every node, capped at 4 hops, to get a real graph-distance instead of a flat "linked vs. not" split - a note 2-3 hops away pulls in visibly closer than a wholly disconnected one, decaying with distance.
3. Weights direct edges by relation type: `EQUIVALENT_TO`/`ANALOGOUS_TO` attract more strongly than a generic relation ("these are basically the same idea"), a plain WikiLink attracts less than a typed relation, and a direct `CONFLICTS_WITH` edge actively pushes the two notes apart instead of just failing to attract them. `INDEPENDENT_OF` is treated as neutral (baseline weight), not repulsive - "independent" reads as a neutral statement, not an active opposition.
4. Feeds the resulting per-pair weight into the same force-simulation shape the other modes use (attraction toward an ideal distance, or a fixed repulsion within `1.8×` node spacing for `CONFLICTS_WITH` pairs).

### 2.2. Interactive HTML5 Canvas Renderers
- **Main 2D Graph View (`MemVector Graph`):** High-performance HTML5 Canvas supporting panning, smooth trackpad zooming, node hover tooltips, and real-time query filtering.
- **Selectable Visual Styles:** "Monochrome" (neutral dots, color only on selection), "Muted Type Colors" (desaturated per-type colors + one soft glow per cluster), and "Ink & Focus Glow" (outline-only dots; glow appears only on notes connected to the current selection via WikiLink and/or Memgraph relation, weighted by how many of each). No mode renders an always-on additive density heatmap anymore - that turned into visual noise in dense vaults and was replaced by the above.
- **Mini-Radar Cutout View (Sidebar):** Renders a relative 2D cutout view centered at $(0,0)$ on the currently active note, framing the top $X$ nearest vector neighbors with polar distance rings. Neighbors come from a real vector-store lookup (`renderActiveNoteFocus.ts`'s `findVectorNeighbors` - fetches the active note's own stored embedding via `VectorStore.getVector()`, then `search()`s against it) whenever the active note has already been synced; it falls back to a local word/formula-overlap heuristic (`activeNoteScoring.ts`'s `rankCandidates`) if not, or if the configured backend is unreachable - never a hard failure.

### 2.3. Multi-Select & Selection State
- **Single Click:** Replaces current selection with the clicked note node.
- **Cmd-Click / Ctrl-Click:** Toggles multi-selection state for targeted nodes.
- **Lasso Tool:** Freehand polygon selection loop (`Shift` + drag or Lasso toggle).
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
  - **Local Vector Store** (`sqlite/sqliteVectorStore.ts`): dense BGE-M3 embeddings are persisted in SQLite and cosine similarity search is computed locally in JavaScript.
  - **WASM Database (`sql.js`)** (`sqlite/sqliteDb.ts`): runs pure SQLite compiled to WebAssembly, eliminating native binary compatibility issues with Obsidian Electron runtimes. The database is cleanly serialized to `memvector-local.sqlite` via Obsidian's vault adapter.

- **Remote Backends (Planned for v0.2+, see `ROADMAP.md`):**
  - **Memgraph Graph Database**: direct graph queries over the Bolt protocol.
  - **Qdrant Vector Database**: distributed vector search collection for multi-device workflows.

### 2.6. Relation Vocabulary

Relation types are **not hardcoded** in the plugin - they're defined by a plain JSON file in the vault (`relationVocabulary/loadRelationVocabulary.ts`, default path `wiki/relation-types.json`, configurable in Settings). Each entry (`RelationTermDef`, `relationVocabulary/types.ts`) is `{ key, label, term, category, bidirectional, reversed, suggest? }`:

- `label` is the canonical Cypher/graph relationship type (e.g. `IMPLIES`, or `TREATS` for a medical vault); several `term`s can consolidate to one `label`.
- `term` is the display text shown in the Relation Builder dropdown, in whatever language the vault author wrote it in.
- `reversed` swaps src/tgt at save time for terms whose natural reading runs backwards (e.g. "follows from").
- `suggest` (optional): reserved for a not-yet-merged LLM-assisted edge-typing feature (see `feature/llm-edge-suggestions` branch) - currently unused.

If the file doesn't exist yet, it's auto-created on first use of the Relation Builder with a bundled STEM preset (13 labels, 37 English terms - `relationVocabulary/defaultVocabulary.ts`) as a starting point. From then on the file is authoritative; the constant is never read again for that vault. This is why `drawEdges.ts`'s edge colors are assigned by hashing the label string rather than a per-label lookup table - colors need to work for whatever labels a vault actually defines, not just the bundled 13.
