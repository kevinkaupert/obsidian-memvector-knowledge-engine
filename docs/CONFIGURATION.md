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
| **Anthropic Claude** | `https://api.anthropic.com/v1` | Your `sk-ant-...` Key | `claude-sonnet-5` |
| **DeepSeek Cloud** | `https://api.deepseek.com/v1` | Your `sk-...` Key | `deepseek-reasoner` |
| **OpenAI** | `https://api.openai.com/v1` | Your `sk-...` Key | `gpt-4o` |
| **OpenRouter** | `https://openrouter.ai/api/v1` | Your `sk-or-...` Key | `anthropic/claude-sonnet-5` |
| **Custom Endpoint** | `http://localhost:8000/v1` | (Optional) | `custom-model` |

> Each provider now keeps its own API key in settings — switching the provider dropdown no longer clears a previously entered key for another provider.

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

### Section 4 & 5: Vector & Graph Database Connections

Both sections now start with a **backend dropdown**, chosen independently:

- **Vector Backend:** **Qdrant** (syncs embeddings to a Qdrant collection over REST) or **Local (SQLite)** - embeddings stored in the plugin's own local file, brute-force cosine search, no server needed. Switching hides the URL/API-key fields for whichever isn't selected.
- **Graph Backend:** **Memgraph** (syncs the vault graph and relation edges under `wiki/relations/` via the **Bolt protocol**, `bolt://host:port`, default `bolt://localhost:7687` - not HTTP) or **Local (SQLite)** - notes/edges in the same local file, multi-hop neighbor lookups via a recursive SQL query instead of Cypher.

The local file (`memvector-local.sqlite`, shared by both if you pick Local for each) lives under `.obsidian/plugins/obsidian-memvector-knowledge-engine/` - it's gitignored like `data.json`, and switching backends doesn't migrate data between them: re-run the sync button for whichever backend you just switched to.

---

## 3. Where Your Settings Are Stored — Secrets vs. Plain Settings

Since v1.7.0 (requires Obsidian **1.11.4+**), every secret this plugin needs — per-provider LLM API keys, the embedding API key, the Qdrant API key, and the Memgraph password — is stored via Obsidian's own `app.secretStorage` API, **not** in this plugin's `data.json`. Everything else (URLs, model names, filter settings, etc.) still lives in `data.json` as plain, non-secret configuration, same as before.

On first load after upgrading, any secret found in an existing `data.json` (from before v1.7.0) is migrated into `secretStorage` automatically, once, and then stripped from `data.json` on the next settings save.

A couple of things still worth knowing:

- `app.secretStorage` is desktop-only (this plugin already is, via `isDesktopOnly: true`), and any other locally-installed Obsidian plugin can technically call `secretStorage.getSecret()` too — it isn't sandboxed per-plugin. It does, however, keep your keys out of `data.json` entirely, so they're no longer exposed by iCloud/vault sync, this plugin's own backups, or anyone with read access to the vault folder on disk.
- Prefer provider API keys that can be scoped to low privilege / revoked independently (most providers support per-key scoping or easy revocation) as an additional layer regardless of storage mechanism.
- If you're on an Obsidian version older than 1.11.4, this plugin won't load at all (`minAppVersion` enforces it) — update Obsidian first.
