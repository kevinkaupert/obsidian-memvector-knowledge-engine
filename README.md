# MemVector Knowledge Engine

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Obsidian](https://img.shields.io/badge/Obsidian-%E2%89%A51.11.4-7c3aed)
![Platform](https://img.shields.io/badge/platform-desktop--only-lightgrey)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
![Tests](https://img.shields.io/badge/tests-99%20passing-brightgreen)

A 100% local-first, privacy-focused **2D Vector Space Visualizer, SQLite Graph Engine & Hybrid GraphRAG AI Co-Pilot** for Obsidian.

It turns your Markdown vault into an explorable 2D semantic map with real vector distances, lets you establish typed relationships between notes, and synthesizes structured knowledge from note selections using any OpenAI-compatible LLM. Everything runs **fully local, offline, and zero-setup** via a bundled SQLite backend (`sql.js`).

---

## 📚 Documentation

Detailed documentation is available in the [`docs/`](docs/) directory:

- [**Roadmap & Deferred Features (`docs/ROADMAP.md`)**](docs/ROADMAP.md): Overview of v0.1 capabilities and future milestones.
- [**System Architecture (`docs/ARCHITECTURE.md`)**](docs/ARCHITECTURE.md): Component map, 2D vector reduction, SQLite storage, and LLM integrations.
- [**Configuration Guide (`docs/CONFIGURATION.md`)**](docs/CONFIGURATION.md): Complete settings reference, provider setup, vocabulary customization, and vault exclusions.
- [**User Guide (`docs/USER_GUIDE.md`)**](docs/USER_GUIDE.md): Canvas interaction controls, gesture reference, mini-radar sidebar, and AI synthesis workflow.
- [**Hybrid GraphRAG Context Enrichment (`docs/GRAPHRAG.md`)**](docs/GRAPHRAG.md): How the synthesis feature enriches prompts with vector-similar and graph-neighboring notes.

---

## 🌟 Key Features (v0.1.0)

- **100% Local-First & Zero-Setup (SQLite via WASM):** All note embeddings and graph edges are stored locally in `.obsidian/plugins/obsidian-memvector-knowledge-engine/memvector-local.sqlite`. No Docker, no database servers, no network setup needed.
- **GraphVektor 2D Canvas:** Real physical force simulation combining genuine cosine vector similarity, WikiLinks, and typed relationship edges.
- **Active Note Mini-Radar (Sidebar):** Renders polar distance rings centered on the active note where radial distance directly reflects true vector cosine distance $(1 - \text{similarity})$.
- **Hybrid GraphRAG Knowledge Synthesis:** Multi-hop graph traversal and semantic vector retrieval loaded directly into the AI synthesis prompt.
- **Typed Relation Builder:** Cmd-click or lasso-select notes to establish structured semantic relationships with custom vocabularies (`wiki/relation-types.json`).
- **Flexible LLM & Embedding Providers:** Connect to local Ollama or cloud providers (Anthropic Claude, OpenAI, DeepSeek, OpenRouter, Custom REST) with secure key storage in Obsidian Secret Storage.

---

## Installation & Quickstart

1. Build or copy `main.js`, `manifest.json`, and `sql-wasm.wasm` into `<your-vault>/.obsidian/plugins/obsidian-memvector-knowledge-engine/`.
2. Enable **MemVector Knowledge Engine** in **Obsidian Settings** → **Community Plugins**.
3. In Plugin Settings, choose your Embedding and LLM provider (Ollama works out of the box with `bge-m3`).
4. Click **"Gesamtes Vault lokal indizieren"** to compute embeddings and graph topology.
5. Open the 2D Graph from the ribbon icon or command palette.

---

## License

Distributed under the [MIT License](LICENSE).

