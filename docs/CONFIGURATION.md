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
- **Path & File Exclusions (`vectorSearchExclusions`):** `-path:schema -file:index -file:log -file:README -file:AGENTS -file:PROFILE -file:canvas-` (default). Notes matching these are skipped by the vector scan.
- **Unselected Label Opacity:** How faded the title label of a non-selected, non-connected note is in the graph view (default `35%`).
- **Mini-Radar Note Count ($X$):** Number of nearest vector neighbors framed in the sidebar (default `10`).
- **Relation Vocabulary File (`relationVocabularyPath`):** Vault path to the relation-type definitions used by the Relation Builder - see Section 3.5 below (default `wiki/relation-types.json`).
- **Agent Guideline Files (`agentsGuidelinePaths`):** Vault paths (comma-separated) loaded as house-style rules for synthesis when "Include agent guidelines" is on (default `AGENTS.md, meta/PROFILE.md`).
- **Synthesis Link Mode / Cloud Naming Mode:** How synthesis output auto-links concepts, and how topic clusters in the graph view are named.

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

---

### Section 3.5: Relation Vocabulary (which relation types exist, set in the General section)

The Relation Builder's type dropdown is **not hardcoded** - it's read from a vault file (default `wiki/relation-types.json`, path configurable via `relationVocabularyPath` in the General section). If the file doesn't exist yet, it's created automatically the first time you open the Relation Builder, seeded with a bundled STEM (math/formal-sciences) preset: 13 canonical labels (`IMPLIES`, `REQUIRES`, `EQUIVALENT_TO`, `GENERALIZES`, `SPECIALIZES`, `EXTENDS`, `REDUCES_TO`, `CONSTRUCTS`, `EMBEDS_IN`, `REFUTES`, `CONFLICTS_WITH`, `INDEPENDENT_OF`, `ANALOGOUS_TO`) behind 37 everyday terms.

From that point on, the file is yours to edit - rename, remove, or add terms for any domain:

```json
{
  "terms": [
    { "key": "relTreats", "label": "TREATS", "term": "treats", "category": "Clinical", "bidirectional": false, "reversed": false, "suggest": true },
    { "key": "relContraindicated", "label": "CONTRAINDICATED_WITH", "term": "is contraindicated with", "category": "Clinical", "bidirectional": true, "reversed": false }
  ]
}
```

- `key`: stable identifier, used internally - never shown to the user.
- `label`: the canonical relationship type stored in the graph database and shown on edges.
- `term`: the dropdown display text, in any language.
- `category`: dropdown group heading.
- `bidirectional`: renders/queries the edge in both directions.
- `reversed`: swaps source/target at save time for terms whose natural reading runs backwards (e.g. "follows from").
- `suggest` (optional): reserved for a not-yet-merged LLM-assisted edge-typing feature - currently unused.

Editing the file only changes what's *offered* going forward - existing relation notes and graph edges keep whatever label they were saved with.

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
