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

### 2.2. Interactive HTML5 Canvas Renderers
- **Main 2D Graph View (`MemVector Graph`):** High-performance HTML5 Canvas supporting panning, smooth trackpad zooming, node hover tooltips, and real-time query filtering.
- **Additive Density Glow (Heatmap Layer):** Renders glowing radial gradients underneath dense clusters using `lighter` blend modes.
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
- **Memgraph Cypher Graph Database:** Pushes structured relationships (`type: relation`, `Voraussetzung: [[...]]`, `Impliziert: [[...]]`) directly into Memgraph via Cypher HTTP queries.
