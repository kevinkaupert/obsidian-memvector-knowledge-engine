# MemVector Knowledge Engine — Configuration & Customization Guide

---

## 1. Plugin Settings Overview

The settings menu is organized into 5 clean sections:

1. **General**
2. **LLM Provider (for AI Synthesis & Co-Pilot)**
3. **Knowledge Domain & Vector Space Filter (Embedding Provider Setup)**
4. **Qdrant Vector Database Connection**
5. **Memgraph Graph Database Connection**

---

## 2. Section Details

### Section 1: General
- **Language / Sprache:** Choose UI language (`Deutsch` / `English`). All setting titles, descriptions, dropdown options, and notices translate automatically when toggled.

---

### Section 2: LLM Provider Setup (for AI Synthesis)

Configures the Large Language Model used for **selection-based synthesis** and reasoning notes.

| Provider | Base URL | API Key | Default Model |
|---|---|---|---|
| **Ollama (Local)** | `http://localhost:11434/v1` | `ollama` | `deepseek-r1:7b` |
| **Anthropic Claude** | `https://api.anthropic.com/v1` | Your `sk-ant-...` Key | `claude-3-5-sonnet-20241022` |
| **DeepSeek Cloud** | `https://api.deepseek.com/v1` | Your `sk-...` Key | `deepseek-reasoner` |
| **OpenAI** | `https://api.openai.com/v1` | Your `sk-...` Key | `gpt-4o` |
| **OpenRouter** | `https://openrouter.ai/api/v1` | Your `sk-or-...` Key | `anthropic/claude-3.5-sonnet` |
| **Custom Endpoint** | `http://localhost:8000/v1` | (Optional) | `custom-model` |

---

### Section 3: Knowledge Domain & Embedding Provider Setup

> [!IMPORTANT]
> **Independent Embedding Provider & LLM Synthesis Provider**
> You can now use local Ollama (`bge-m3`) for dense 2D embeddings **while simultaneously using Anthropic Claude API or OpenAI GPT-4o for synthesis**!

#### Dedicated Embedding Settings

- **Embedding Provider (`embeddingProvider`):**
  - **Ollama (Local):** `http://localhost:11434/v1`, Model: `bge-m3`
  - **OpenAI Embeddings:** `https://api.openai.com/v1`, Model: `text-embedding-3-small`
  - **Custom REST Endpoint:** `http://localhost:8000/v1`
- **Embedding API Base URL (`embeddingApiBaseUrl`):** Separate endpoint URL for vector embeddings.
- **Embedding API Key (`embeddingApiKey`):** Separate API key for vector embeddings (type `ollama` for local Ollama).
- **Embedding Model Name (`embeddingModel`):** Exact model name (e.g. `bge-m3`, `nomic-embed-text`, `text-embedding-3-small`).

#### Knowledge Domain Modes

- **`general` (Universal Notebook):** Term frequency + semantic clustering for PKM, research, and code.
- **`math` (Mathematics & Formal Sciences):** LaTeX formula extraction & 15x feature weighting for formal definitions, theorems, and proofs.

#### Vault Exclusions & Mini-Radar Count

- **Path & File Exclusions (`vectorSearchExclusions`):** `-path: schema -file:index -file:log -file:README`
- **Mini-Radar Note Count ($X$):** Number of nearest vector neighbors framed in sidebar (Default: `10`).

---

### Section 4 & 5: Qdrant & Memgraph Connections
- **Qdrant Vector DB:** Syncs embeddings to Qdrant collection.
- **Memgraph Graph DB:** Syncs relation edges (`wiki/relations/`) via HTTP Cypher.
