# MemVector Knowledge Engine

![Version](https://img.shields.io/badge/version-1.11.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Obsidian](https://img.shields.io/badge/Obsidian-%E2%89%A51.11.4-7c3aed)
![Platform](https://img.shields.io/badge/platform-desktop--only-lightgrey)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
![Tests](https://img.shields.io/badge/tests-118%20passing-brightgreen)

A local-first, privacy-focused **2D Vector Space Visualizer, Graph Engine & AI Co-Pilot** for Obsidian.

It turns a vault of Markdown notes into an explorable 2D map, lets you draw typed relationships between notes (with an optional local LLM suggesting which type fits), and synthesizes new knowledge from selections using any OpenAI-compatible LLM. Everything can run **fully local and offline** — a bundled SQLite backend stands in for both the vector index and the graph database, so external servers (Qdrant, Memgraph) are optional, not required.

The plugin ships with a STEM (math/formal-sciences) example configuration — a 13-label relation vocabulary, LaTeX-aware embeddings — because that's what it was originally built for. None of it is hardcoded: the relation types are a plain file in your vault that you can rewrite for medicine, law, project management, or anything else, and every domain-specific behavior is a setting, not an assumption.

![MemVector Knowledge Engine Overview](assets/plugin_overview.png)

---

## 📚 Documentation

Detailed documentation is available in the [`docs/`](docs/) directory:

- [**System Architecture (`docs/ARCHITECTURE.md`)**](docs/ARCHITECTURE.md): Component map, 2D vector reduction, storage backends, and LLM integrations.
- [**Configuration & Customization Guide (`docs/CONFIGURATION.md`)**](docs/CONFIGURATION.md): Complete settings reference, LLM provider setup, relation vocabulary customization, and vault exclusions.
- [**User Guide (`docs/USER_GUIDE.md`)**](docs/USER_GUIDE.md): Canvas interaction controls, gesture reference, right glassmorphic panel, mini-radar sidebar, and AI synthesis workflow.
- [**Manual Integration Testing (`docs/TESTING.md`)**](docs/TESTING.md): Repeatable synthetic-note procedure to verify Qdrant and Memgraph sync end-to-end, independent of the plugin's own UI.
- [**Hybrid GraphRAG Context Enrichment (`docs/GRAPHRAG.md`)**](docs/GRAPHRAG.md): How and why the synthesis feature pulls in vector-similar and graph-neighboring notes as extra LLM context, with synthetic proof it actually finds context a single-source approach would miss.

---

## Key Features

- **2D MemVector Graph View:** High-performance HTML5 Canvas with 7 layout algorithms, real-time query filtering, and smooth trackpad pan/zoom.
- **Relation Builder with optional AI assist:** Draw typed relationships between notes from a fully customizable vocabulary file; optionally have a local LLM suggest which type fits, or double-check one you picked, before you save.
- **Selection-Based AI Synthesis:** Lasso select or Cmd-click target nodes in the 2D plot to trigger AI knowledge synthesis using any configured LLM (Ollama, Anthropic Claude, OpenAI, DeepSeek, OpenRouter).
- **Fully local option:** Run the graph and vector index on a bundled SQLite backend — no Docker, no external server, nothing to configure beyond enabling it.
- **Active Note Mini-Radar (Sidebar):** Renders a relative 2D cutout view centered on your active note with polar distance rings and nearest-neighbor navigation.
- **Domain-agnostic by design:** Relation types, feature weighting, and the LLM edge-suggestion prompt are all driven by your own configuration and vault content — the bundled STEM preset is a starting point, not a limitation.
- **Multi-Language Support (i18n):** Full UI and settings translation in German and English.
- **Pluggable storage backends:** Qdrant + Memgraph for multi-device sync, or local SQLite for zero-setup offline use — chosen independently for graph and vector storage.
- **Hybrid GraphRAG Context Enrichment:** Optional toggle that augments the AI synthesis prompt with notes you didn't select — found via vector similarity *and* graph neighborhood (1-2 hops), merged and clearly separated from your actual selection. See [`docs/GRAPHRAG.md`](docs/GRAPHRAG.md) for how and why.

---

## Installation & Setup

1. Copy `main.js`, `manifest.json`, and `sql-wasm.wasm` to `<your-vault>/.obsidian/plugins/obsidian-memvector-knowledge-engine/`.
2. Enable **MemVector Knowledge Engine** in **Obsidian Settings** → **Community Plugins**.
3. Configure your preferred LLM Provider in Plugin Settings — Ollama (local, free) works out of the box if it's running.
4. For the graph and vector storage, either leave the defaults (Memgraph + Qdrant, for multi-device sync) or switch both dropdowns to **Local (SQLite)** in Settings for a zero-server setup. See [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md).

---

## License

Distributed under the [MIT License](LICENSE).
