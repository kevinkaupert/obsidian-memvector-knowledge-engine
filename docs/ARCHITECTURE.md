# MemVector Knowledge Engine — System Architecture

**Version:** 1.6.3  
**License:** MIT  

---

## 1. Overview

**MemVector Knowledge Engine** is a local-first, privacy-focused Obsidian plugin designed to visualize, search, and synthesize complex Markdown knowledge vaults using **2D Vector Embeddings**, **Graph Databases (Memgraph)**, and **Large Language Models (Ollama, Anthropic Claude, OpenAI, DeepSeek)**.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Obsidian Vault Notes                           │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
             ┌───────────────────────┴───────────────────────┐
             ▼                                               ▼
┌───────────────────────────┐                   ┌───────────────────────────┐
│     2D Vector Engine      │                   │    Graph Database Sync    │
│  (PCA / UMAP Projection)  │                   │     (Memgraph Cypher)     │
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
- **Feature Weighting:** Distinguishes between **General Knowledge Vaults** (PKM, research, code) and **Mathematical Vaults** (LaTeX definitions, theorems, proofs).

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

### 2.5. External Database Connections (Optional)
- **Qdrant Vector Database:** Syncs dense embeddings to a remote/local Qdrant collection for multi-device vector search.
- **Memgraph Graph Database:** Pushes structured relationships (`type: relation`, `Voraussetzung: [[...]]`, `Impliziert: [[...]]`) directly into Memgraph over the **Bolt protocol**, via `neo4j-driver-lite` (Memgraph documents Bolt-driver compatibility with the standard Neo4j drivers). An earlier version of this plugin attempted this over a plain HTTP `/db/data/cypher` endpoint (an old, removed Neo4j REST route Memgraph never implemented), which silently never worked and fell back to copying Cypher to the clipboard while still reporting success — that path has been replaced entirely.
