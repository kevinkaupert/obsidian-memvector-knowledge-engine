# MemVector Knowledge Engine

![Version](https://img.shields.io/badge/version-0.1.6-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Obsidian](https://img.shields.io/badge/Obsidian-%E2%89%A51.11.4-7c3aed)
![Platform](https://img.shields.io/badge/platform-desktop--only-lightgrey)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
![Tests](https://img.shields.io/badge/tests-257%20passing-brightgreen)

**A 2D thinking workspace for Obsidian.**

Not a graph viewer. Not a replacement for Obsidian Graph. A space where you
map what you believe connects your concepts — and why — and the map becomes
a navigable, queryable artifact of your thinking.

<img width="1016" height="963" alt="MemVector 2D Canvas" src="https://github.com/user-attachments/assets/11dceff4-1a42-411b-8d7a-e116396090cd" />

---

## The core idea

Obsidian Graph shows you **what you linked**. MemVector shows you **what you
believe is connected — and how strongly, and why**.

You select two or more notes and declare a typed relation:

```
Concept A  →  IMPLIES  →  Concept B
Theorem X  →  REQUIRES  →  Definition Y
Claim P    →  CONFLICTS_WITH  →  Claim Q
```

That declaration does three things at once:

1. **Moves them in the 2D canvas.** `EQUIVALENT_TO` pulls notes closer than
   a generic relation. `CONFLICTS_WITH` actively pushes them apart. The spatial
   layout is a direct expression of your declared structure.

2. **Creates a Markdown file in your vault.** The relation lives in
   `wiki/relations/` as a normal `.md` file — readable, editable,
   version-controlled, searchable. You can write a reason in plain text.
   Nothing is hidden in a database you cannot inspect.

3. **Persists to a local SQLite graph.** Relations are traversable at query
   time: multi-hop neighbor lookups, AI synthesis context, radar sidebar —
   all read this graph.

Semantic embeddings run underneath as a second force: notes with similar
content are pulled together even without an explicit relation. Your declared
relations win when they are stronger. The vector similarity fills the gaps.

---

## What it is not

- **Not a WikiLink visualizer.** WikiLinks are opt-in and carry the weakest
  graph weight (0.7) — weaker than any typed relation. The default is off.
- **Not a replacement for Obsidian Graph.** Both coexist. Obsidian Graph
  shows your link structure. MemVector shows your declared conceptual
  structure.
- **Not automated knowledge extraction.** No LLM reads your notes and builds
  the graph for you. You build it. The AI assists when you ask it to
  synthesize.
- **Not classical GraphRAG.** Classical GraphRAG traverses an automatically
  generated topology and feeds it to an LLM. MemVector's graph is an
  intentional artifact — the LLM gets *your thinking* as context, not a
  machine-generated one.

---

## Relation types

Thirteen canonical types ship as a starting vocabulary. All are customizable
via `wiki/relation-types.json` in your vault — nothing is hardcoded.

| Type | Meaning | Force in canvas |
|------|---------|-----------------|
| `EQUIVALENT_TO` | Same concept, different formulation | Strongest pull (×1.3) |
| `ANALOGOUS_TO` | Structurally similar | Strong pull (×1.1) |
| `IMPLIES` | A makes B necessary | Standard (×1.0) |
| `REQUIRES` | A presupposes B | Standard (×1.0) |
| `GENERALIZES` | A is the broader case | Standard (×1.0) |
| `SPECIALIZES` | A is a special case | Standard (×1.0) |
| `EXTENDS` | A builds on B | Standard (×1.0) |
| `CONSTRUCTS` | A constructs B | Standard (×1.0) |
| `EMBEDS_IN` | A is embedded in B | Standard (×1.0) |
| `REDUCES_TO` | A reduces to B | Standard (×1.0) |
| `REFUTES` | A refutes B | Standard (×1.0) |
| `CONFLICTS_WITH` | Active contradiction | **Active repulsion** |
| `INDEPENDENT_OF` | No connection | Neutral (×0.05) |

Each type has a dedicated color on the canvas. Custom types get a
deterministic color from a hash — no manual color assignment needed.

---

## Key features

- **Intentional 2D layout.** A force simulation combines your typed
  relations and semantic embeddings. Position is meaning.
- **Relations as Markdown.** Every relation is a `.md` file in your vault
  with a type, an optional reason, and WikiLinks to both notes. Not a
  black box.
- **Three topology modes.** Hub (`Focal → Rest`), convergence
  (`Rest → Focal`), or sequence (`Chain: A → B → C → ...`) — for
  structuring how a set of selected notes relate to each other.
- **Mini-Radar sidebar.** A polar view centered on your active note.
  Radial distance = true cosine distance `(1 − similarity)`. Updates as
  you switch notes.
- **Hybrid GraphRAG synthesis.** When you ask the AI to synthesize, it
  enriches your selection with two independent lookups: vector-similar
  notes (finds semantic neighbors with no graph path) and graph-hop
  neighbors (finds structurally linked notes with different vocabulary).
  Neither alone covers both.
- **100% local-first, zero setup.** All embeddings and graph edges live in
  a bundled SQLite database (`memvector-local.sqlite`) inside your vault.
  No Docker, no server, no network call for storage.
- **Flexible AI providers.** Ollama (local), Anthropic Claude, OpenAI,
  DeepSeek, OpenRouter, or any custom OpenAI-compatible endpoint. API keys
  are stored in Obsidian's secure Secret Storage — never in plain text.

---

## Status: Early-Stage (Pre-1.0)

This plugin is at version `0.1.x` and under active development. The version
number stays below `1.0.0` on purpose — it has not yet reached the stability
that number implies. Expect rough edges, and check the
[open issues](https://github.com/kevinkaupert/obsidian-memvector-knowledge-engine/issues)
before relying on it for anything critical.

---

## Documentation

- [**Roadmap** (`docs/ROADMAP.md`)](docs/ROADMAP.md) — v0.1 capabilities and future milestones
- [**Architecture** (`docs/ARCHITECTURE.md`)](docs/ARCHITECTURE.md) — component map, force layout, SQLite storage
- [**Configuration** (`docs/CONFIGURATION.md`)](docs/CONFIGURATION.md) — settings reference, provider setup, vocabulary
- [**User Guide** (`docs/USER_GUIDE.md`)](docs/USER_GUIDE.md) — canvas controls, gesture reference, synthesis workflow
- [**Hybrid GraphRAG** (`docs/GRAPHRAG.md`)](docs/GRAPHRAG.md) — how synthesis enriches prompts with vector and graph context

---

## Installation & Quickstart

1. Copy `main.js`, `manifest.json`, `styles.css`, and `sql-wasm.wasm` into
   `<your-vault>/.obsidian/plugins/memvector-knowledge-engine/`.
2. Enable **MemVector Knowledge Engine** in **Settings → Community Plugins**.
3. Choose your embedding and LLM provider — Ollama with `bge-m3` works
   out of the box with no API key.
4. Click **"Index entire vault"** to compute embeddings.
5. Open the 2D canvas from the ribbon icon or command palette.
6. Select two notes, `Cmd-click` a second one or use the lasso, then open
   the Relation Builder to declare your first typed relation.

---

## License

Distributed under the [MIT License](LICENSE).
