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
- **Path & File Exclusions (`vectorSearchExclusions`):** `-path:schema -file:index -file:log -file:README -file:AGENTS -file:PROFILE -file:canvas-` (default). Notes matching these patterns are excluded from the vector scatterplot and search.
- **Unselected Label Opacity:** Opacity for title labels of non-selected, non-connected notes in the graph view (default `35%`).
- **Mini-Radar Note Count ($X$):** Number of nearest vector neighbors framed in the sidebar radar view (default `10`).
- **Relation Vocabulary File (`relationVocabularyPath`):** Vault path to the relation-type definitions used by the Relation Builder (default `wiki/relation-types.json`).
- **Agent Guideline Files (`agentsGuidelinePaths`):** Vault paths (comma-separated) loaded as house-style rules for synthesis when "Include agent guidelines" is enabled (default `AGENTS.md, meta/PROFILE.md`).

---

### Section 2: LLM Provider Setup (for AI Synthesis)

Configures the Large Language Model used for **selection-based synthesis** and reasoning notes.

| Provider | Base URL | API Key | Default Model |
|---|---|---|---|
| **Ollama (Local)** | `http://localhost:11434/v1` | `ollama` (or blank) | `deepseek-r1:7b` |
| **Anthropic Claude** | `https://api.anthropic.com/v1` | Your `sk-ant-...` Key | `claude-sonnet-5` |
| **DeepSeek Cloud** | `https://api.deepseek.com/v1` | Your `sk-...` Key | `deepseek-reasoner` |
| **OpenAI** | `https://api.openai.com/v1` | Your `sk-...` Key | `gpt-4o` |
| **OpenRouter** | `https://openrouter.ai/api/v1` | Your `sk-or-...` Key | `anthropic/claude-sonnet-5` |
| **Custom Endpoint** | `http://localhost:8000/v1` | (Optional) | `custom-model` |

> Each provider keeps its own API key in settings — switching the provider dropdown preserves previously entered keys.

---

### Section 3: Knowledge Domain & Embedding Provider Setup

> [!IMPORTANT]
> **Independent Embedding Provider & LLM Synthesis Provider**
> You can use local Ollama (`bge-m3`) for dense 2D embeddings **while simultaneously using Anthropic Claude API or OpenAI GPT-4o for synthesis**!

#### Dedicated Embedding Settings

- **Embedding Provider (`embeddingProvider`):**
  - **Ollama (Local):** `http://localhost:11434/v1`, Model: `bge-m3`
  - **OpenAI Embeddings:** `https://api.openai.com/v1`, Model: `text-embedding-3-small`
  - **Custom REST Endpoint:** `http://localhost:8000/v1`
- **Embedding API Base URL (`embeddingApiBaseUrl`):** Endpoint URL for vector embeddings.
- **Embedding API Key (`embeddingApiKey`):** API key for vector embeddings (type `ollama` for local Ollama).
- **Embedding Model Name (`embeddingModel`):** Exact model name (e.g. `bge-m3`, `nomic-embed-text`, `text-embedding-3-small`).
- **Gesamtes Vault lokal indizieren:** Computes embeddings and graph connections for all markdown files and stores them directly in the local `memvector-local.sqlite` database.

#### Knowledge Domain Modes

- **`general` (Universal Notebook):** Term frequency + semantic clustering for PKM, research, and code.
- **`math` (Mathematics & Formal Sciences):** LaTeX formula extraction & 15x feature weighting for formal definitions, theorems, and proofs.

---

### Section 3.5: Relation Vocabulary (`wiki/relation-types.json`)

The Relation Builder's type dropdown is read from a configurable vault file (default `wiki/relation-types.json`). If the file doesn't exist yet, it is created automatically the first time you open the Relation Builder, seeded with 13 canonical labels (`IMPLIES`, `REQUIRES`, `EQUIVALENT_TO`, `GENERALIZES`, `SPECIALIZES`, `EXTENDS`, `REDUCES_TO`, `CONSTRUCTS`, `EMBEDS_IN`, `REFUTES`, `CONFLICTS_WITH`, `INDEPENDENT_OF`, `ANALOGOUS_TO`) across 37 everyday terms.

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
- `label`: the canonical relationship type stored in the SQLite graph table and YAML frontmatter.
- `term`: the dropdown display text.
- `category`: dropdown group heading.
- `bidirectional`: whether the relationship holds symmetrically in both directions.
- `reversed`: swaps source/target at save time for terms whose natural reading runs backwards (e.g. "follows from").

---

## 3. Storage Layer (Local SQLite via WASM)

All note embeddings and graph relationships are stored in:
`<vault>/.obsidian/plugins/obsidian-memvector-knowledge-engine/memvector-local.sqlite`

- **Database Engine:** `sql.js` (SQLite compiled to WebAssembly), requiring zero external processes or Docker containers.
- **Tables:**
  - `notes`: `(id TEXT PRIMARY KEY, title TEXT, path TEXT)`
  - `edges`: `(src TEXT, tgt TEXT, type TEXT, description TEXT, bidirectional INTEGER, original_term TEXT, updated_at TEXT)`
  - `vectors`: `(id TEXT PRIMARY KEY, path TEXT, title TEXT, content TEXT, vector TEXT)`
- **Multi-Hop Traversal:** Executed locally via recursive SQL CTE queries (`WITH RECURSIVE reachable...`).

---

## 4. Secret Storage & Privacy

All API keys (LLM keys and embedding keys) are securely stored in Obsidian's native `app.secretStorage` API rather than in `data.json`.
- `data.json` contains only non-sensitive configuration (model names, URLs, thresholds, visual styles).
- Remote servers only receive requests explicitly initiated by the user (embedding computation or synthesis). All graph data and SQLite storage remain 100% on device.

