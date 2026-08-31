# MemVector Knowledge Engine — System Architecture

**Version:** 1.11.0
**License:** MIT

---

## 1. Overview

**MemVector Knowledge Engine** is a local-first, privacy-focused Obsidian plugin designed to visualize, search, and synthesize complex Markdown knowledge vaults using **2D Vector Embeddings**, a **Graph Database** (Memgraph or local SQLite), and **Large Language Models (Ollama, Anthropic Claude, OpenAI, DeepSeek)**.

The plugin is domain-agnostic: it ships with a STEM (math/formal-sciences) example configuration - a 13-label relation vocabulary and LaTeX-aware embedding weighting - but nothing about the storage layer, the relation types, or the LLM prompts assumes mathematics specifically. See §2.6 for how the relation vocabulary is externalized to a vault file rather than hardcoded.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Obsidian Vault Notes                           │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
             ┌───────────────────────┴───────────────────────┐
             ▼                                               ▼
┌───────────────────────────┐                   ┌───────────────────────────┐
│     2D Vector Engine      │                   │    Graph Database Sync    │
│  (PCA / UMAP Projection)  │                   │  (Memgraph or local SQLite)│
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
- **Mini-Radar Cutout View (Sidebar):** Renders a relative 2D cutout view centered at $(0,0)$ on the currently active note, framing the top $X$ nearest vector neighbors with polar distance rings.

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

### 2.5. Pluggable Graph/Vector Storage Backends

The relationship graph and the vector index each sit behind a small interface (`sync/graphStore.ts`'s `GraphStore`, `sync/vectorStore.ts`'s `VectorStore`) so the plugin doesn't have to talk to Memgraph/Qdrant directly - `sync/storeFactory.ts` is the one place that picks an implementation based on the `graphBackend`/`vectorBackend` settings, chosen independently:

- **Graph Backend**
  - **Memgraph** (`memgraph/memgraphGraphStore.ts`): pushes structured relationships directly into Memgraph over the **Bolt protocol** via `neo4j-driver-lite` (Memgraph documents Bolt-driver compatibility with the standard Neo4j drivers). An earlier version of this plugin attempted this over a plain HTTP `/db/data/cypher` endpoint (an old, removed Neo4j REST route Memgraph never implemented), which silently never worked and fell back to copying Cypher to the clipboard while still reporting success - that path has been replaced entirely.
  - **Local (SQLite)** (`sqlite/sqliteGraphStore.ts`): no external server - a `notes`/`edges` table in a single file under the plugin folder (`memvector-local.sqlite`), with multi-hop neighbor lookups done via a `WITH RECURSIVE` CTE instead of Cypher. Runs on `sql.js` (SQLite compiled to WASM) rather than a native addon like `better-sqlite3`, specifically to avoid needing prebuilt binaries matched to Obsidian's exact bundled Electron/Node ABI per OS/arch - `sql.js` has no native-binding risk, at the cost of manually (de)serializing the whole DB file via `app.vault.adapter.readBinary`/`writeBinary` after every write (`sqlite/sqliteDb.ts`).
- **Vector Backend**
  - **Qdrant Vector Database:** Syncs dense embeddings to a remote/local Qdrant collection for multi-device vector search.
  - **Local (SQLite)**: embeddings stored in the same local SQLite file, with brute-force cosine similarity computed in JS at query time - fast enough at personal-vault scale (hundreds to a few thousand notes). ChromaDB was considered and rejected: the `chromadb` npm package is an HTTP client that still requires a running Chroma server, so it wouldn't reduce operational complexity versus Qdrant at all.

### 2.6. Relation Vocabulary & LLM Edge-Type Suggestions

Relation types are **not hardcoded** in the plugin - they're defined by a plain JSON file in the vault (`relationVocabulary/loadRelationVocabulary.ts`, default path `wiki/relation-types.json`, configurable in Settings). Each entry (`RelationTermDef`, `relationVocabulary/types.ts`) is `{ key, label, term, category, bidirectional, reversed, suggest? }`:

- `label` is the canonical Cypher/graph relationship type (e.g. `IMPLIES`, or `TREATS` for a medical vault); several `term`s can consolidate to one `label`.
- `term` is the display text shown in the Relation Builder dropdown, in whatever language the vault author wrote it in.
- `reversed` swaps src/tgt at save time for terms whose natural reading runs backwards (e.g. "follows from").
- `suggest: true` opts a term's label into the lean subset offered to the LLM edge-suggestion feature (see below); if no term in the file sets this, every unique label is offered instead.

If the file doesn't exist yet, it's auto-created on first use of the Relation Builder with a bundled STEM preset (13 labels, 37 English terms - `relationVocabulary/defaultVocabulary.ts`) as a starting point. From then on the file is authoritative; the constant is never read again for that vault. This is why `drawEdges.ts`'s edge colors are assigned by hashing the label string rather than a per-label lookup table - colors need to work for whatever labels a vault actually defines, not just the bundled 13.

**LLM edge-type suggestions** (`relationVocabulary/llmSuggestPrompt.ts` for the pure prompt/parsing logic, `llmSuggestRequest.ts` for the actual LLM call): in the Relation Builder, each edge row has a 🔍 (suggest) and ✓ (verify) button.

- 🔍 sends a short prompt - the two notes' titles and a ~220-character frontmatter-stripped excerpt each, plus the `suggest`-flagged label list with their `term` text as a one-line hint - and parses a `LABEL:`/`REASON:`/`COUNTEREXAMPLE:` response back into a dropdown selection (falling back to "Custom" with the raw label if it isn't in the vocabulary) and, if the description field is still empty, pre-fills it with the reason.
- ✓ re-sends the *currently selected* type as a claim (`CLAIM: (A) -[LABEL]-> (B)`) and asks the LLM to confirm or refute it with a one-sentence reason and an optional counterexample.

Both reuse whichever LLM provider/model/key is already configured in Settings (Section 2) - there's no separate hardcoded model for this feature. The prompt is deliberately kept lean (short excerpts, no restated task description in the system prompt) so it also works well with a small local model (e.g. a 1.5B-parameter one) where the main synthesis model might be larger.
