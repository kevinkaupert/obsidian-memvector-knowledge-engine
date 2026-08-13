# MemVector Knowledge Engine — Configuration & Customization Guide

---

## 1. Plugin Settings Overview

The settings menu is organized into 5 clean sections:

1. **General**
2. **LLM Provider (for AI Synthesis & Co-Pilot)**
3. **Knowledge Domain & Vector Space Filter**
4. **Qdrant Vector Database Connection**
5. **Memgraph Graph Database Connection**

---

## 2. Section Details

### Section 1: General
- **Language / Sprache:** Choose UI language (`Deutsch` / `English`). All setting titles, descriptions, dropdown options, and notices translate automatically when toggled.

---

### Section 2: LLM Provider Setup

MemVector supports **any OpenAI-compatible REST API** as well as **native Anthropic Claude API**.

#### Provider Presets & Default Configurations

When selecting a preset in the **LLM Provider** dropdown, fields are automatically reset to sensible defaults:

| Provider | Base URL | API Key | Default Model |
|---|---|---|---|
| **Ollama (Local)** | `http://localhost:11434/v1` | `ollama` | `deepseek-r1:7b` |
| **Anthropic Claude** | `https://api.anthropic.com/v1` | Your `sk-ant-...` Key | `claude-3-5-sonnet-20241022` |
| **DeepSeek Cloud** | `https://api.deepseek.com/v1` | Your `sk-...` Key | `deepseek-reasoner` |
| **OpenAI** | `https://api.openai.com/v1` | Your `sk-...` Key | `gpt-4o` |
| **OpenRouter** | `https://openrouter.ai/api/v1` | Your `sk-or-...` Key | `anthropic/claude-3.5-sonnet` |
| **Custom Endpoint** | `http://localhost:8000/v1` | (Optional) | `custom-model` |

- **Temperature:** Controls AI determinism (`0.0` – `0.2` for precise analytical synthesis; higher values for creative writing).
- **Dynamic Model Name Branding:** Synthesis action buttons, status bars, synthesis modal headers, and Markdown frontmatter metadata (`generated.by`) automatically mirror your configured model name.

---

### Section 3: Knowledge Domain & Vector Space Filter

> [!IMPORTANT]
> **Understanding the Knowledge Domain (`knowledgeDomain`) Feature**

#### Why does the Knowledge Domain exist?

In Obsidian knowledge vaults, notes fall into different structural archetypes:

1. **General Notes (PKM, Coding, Research, Literature):**
   - Notes are primarily text-heavy paragraphs, bulleted outlines, or code blocks.
   - Clustering relies heavily on **word frequencies, term co-occurrences, and semantic NLP embeddings**.

2. **Mathematical & Formal Science Notes (LaTeX Formulas & Proofs):**
   - Notes are often concise in prose, but contain dense inline or block LaTeX formulas (`$x \in A$`, `$$\sum_{i=1}^n ...$$`, `\forall \epsilon > 0`).
   - Standard NLP text embeddings often misclassify mathematical notes because identical LaTeX formulas are treated as plain ASCII strings, while prose descriptions may vary wildly between authors.

#### How the Knowledge Domain Modes Work

- **`general` (Universal Notebook):**
  - Standard term-frequency + semantic clustering.
  - Ideal for general PKM, personal journals, software engineering notes, and research summaries.
  
- **`math` (Mathematics & Formal Sciences):**
  - **LaTeX Formula Extraction:** Automatically extracts all LaTeX expressions (`$...$` and `$$...$$`) from notes.
  - **Heuristic Formula Matching:** Identical LaTeX sub-expressions receive a 15x feature boost (5x base score × 3 multiplier) during similarity scoring.
  - **Type-Based Spatial Offsetting:** Grouping clusters according to note frontmatter types (`type: definition`, `type: theorem`, `type: concept`, `type: relation`, `type: synthesis`).

#### Customizing Vault Exclusions & Mini-Radar Count

- **Path & File Exclusions (`vectorSearchExclusions`):**
  Filter out non-content files, index pages, logs, and schemas using Obsidian Graph View search syntax:
  ```text
  -path: schema -file:index -file:log -file:README -file:AGENTS -file:PROFILE -file:canvas- -file:Beweistricks
  ```
- **Mini-Radar Note Count ($X$):**
  Determines how many top nearest vector neighbors ($X$) are framed inside the active note sidebar mini-radar canvas upon opening a file (Default: `10`).

---

### Section 4: Qdrant Vector Database Integration (Optional)

Connect to a local or remote **Qdrant** instance for high-dimensional vector search across devices.

- **Server URL:** `http://localhost:6333`
- **Collection Name:** `obsidian_wiki_vectors`
- **API Key:** Optional key for Qdrant Cloud.

---

### Section 5: Memgraph Cypher Graph Database Integration (Optional)

Connect to a **Memgraph** graph database via HTTP Cypher endpoint.

- **Server URL:** `http://localhost:7000` (Memgraph Cypher HTTP API)
- **Username / Password:** Credentials for authenticated Memgraph instances.
- **Automatic Cypher Execution:** Automatically syncs relation edges (`wiki/relations/`) directly to Memgraph upon saving.
