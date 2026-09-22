# MemVector Knowledge Engine

![Version](https://img.shields.io/badge/version-0.1.3-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Obsidian](https://img.shields.io/badge/Obsidian-%E2%89%A51.11.4-7c3aed)
![Platform](https://img.shields.io/badge/platform-desktop--only-lightgrey)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
![Tests](https://img.shields.io/badge/tests-164%20passing-brightgreen)

A 100% local-first, privacy-focused **2D Vector Space Visualizer, SQLite Graph Engine & Hybrid GraphRAG AI Co-Pilot** for Obsidian.

It turns your Markdown vault into an explorable 2D semantic map with real vector distances, lets you establish typed relationships between notes, and synthesizes structured knowledge from note selections using any OpenAI-compatible LLM.

The local storage layer is genuinely zero-setup: all embeddings and graph edges live in a bundled SQLite backend (`sql.js`) inside your vault - no Docker, no database server, no network call for storage itself. Computing embeddings and running AI synthesis, however, need a configured embedding/LLM provider: either a local Ollama instance you run yourself, or a cloud provider (Anthropic Claude, OpenAI, DeepSeek, OpenRouter, custom endpoint) - in the cloud-provider case, the selected note content leaves your device as part of that request.

<img width="1406" height="1043" alt="Bildschirmfoto 2026-09-10 um 20 54 57" src="https://github.com/user-attachments/assets/c4d5c823-3802-46cb-91c6-a8c3cc71441e" />

---

## Status: Early-Stage (Pre-1.0)

This plugin is at version `0.1.x` and under active development. The version
number stays below `1.0.0` on purpose - it has not yet reached the stability
and API stability that number implies. Expect rough edges, and check the
[open issues](https://github.com/kevinkaupert/obsidian-memvector-knowledge-engine/issues)
before relying on it for anything critical. Several issues found by
functional review have partial fixes with a documented residual gap rather
than a full resolution; those are tracked openly rather than closed
prematurely. In particular, changing an existing relation's type to one
already connecting the same note pair can silently overwrite the existing
relation file ([#14](https://github.com/kevinkaupert/obsidian-memvector-knowledge-engine/issues/14)).
Vault exclusion patterns are checked when loading GraphRAG neighbors, so changes
apply to enriched context immediately without requiring a re-index.

---

## Documentation

Detailed documentation is available in the [`docs/`](docs/) directory:

- [**Roadmap & Deferred Features (`docs/ROADMAP.md`)**](docs/ROADMAP.md): Overview of v0.1 capabilities and future milestones.
- [**System Architecture (`docs/ARCHITECTURE.md`)**](docs/ARCHITECTURE.md): Component map, 2D vector reduction, SQLite storage, and LLM integrations.
- [**Configuration Guide (`docs/CONFIGURATION.md`)**](docs/CONFIGURATION.md): Complete settings reference, provider setup, vocabulary customization, and vault exclusions.
- [**User Guide (`docs/USER_GUIDE.md`)**](docs/USER_GUIDE.md): Canvas interaction controls, gesture reference, mini-radar sidebar, and AI synthesis workflow.
- [**Hybrid GraphRAG Context Enrichment (`docs/GRAPHRAG.md`)**](docs/GRAPHRAG.md): How the synthesis feature enriches prompts with vector-similar and graph-neighboring notes.

---

## Key Features (v0.1.0)

- **100% Local-First & Zero-Setup (SQLite via WASM):** All note embeddings and graph edges are stored locally in `.obsidian/plugins/memvector-knowledge-engine/memvector-local.sqlite`. No Docker, no database servers, no network setup needed.
- **GraphVektor 2D Canvas:** Real physical force simulation combining genuine cosine vector similarity, WikiLinks, and typed relationship edges.
- **Active Note Mini-Radar (Sidebar):** Renders polar distance rings centered on the active note where radial distance directly reflects true vector cosine distance $(1 - \text{similarity})$.
- **Hybrid GraphRAG Knowledge Synthesis:** Multi-hop graph traversal and semantic vector retrieval loaded directly into the AI synthesis prompt.
- **Typed Relation Builder:** Cmd-click or lasso-select notes to establish structured semantic relationships with custom vocabularies (`wiki/relation-types.json`).
- **Flexible LLM & Embedding Providers:** Connect to local Ollama or cloud providers (Anthropic Claude, OpenAI, DeepSeek, OpenRouter, Custom REST) with secure key storage in Obsidian Secret Storage.

---

## Installation & Quickstart

1. Build or copy `main.js`, `manifest.json`, `styles.css`, and `sql-wasm.wasm` into `<your-vault>/.obsidian/plugins/memvector-knowledge-engine/`.
2. Enable **MemVector Knowledge Engine** in **Obsidian Settings** → **Community Plugins**.
3. In Plugin Settings, choose your Embedding and LLM provider (Ollama works out of the box with `bge-m3`).
4. Click **"Gesamtes Vault lokal indizieren"** to compute embeddings and graph topology.
5. Open the 2D Graph from the ribbon icon or command palette.

---

## License

Distributed under the [MIT License](LICENSE).

