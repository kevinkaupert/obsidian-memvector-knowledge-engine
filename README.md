# MemVector Knowledge Engine

![Version](https://img.shields.io/badge/version-0.3.11-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Obsidian](https://img.shields.io/badge/Obsidian-%E2%89%A51.11.4-7c3aed)
![Platform](https://img.shields.io/badge/platform-desktop--only-lightgrey)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
![Tests](https://img.shields.io/badge/tests-1025%20passing-brightgreen)

**Map what you think connects — and why.**

Obsidian's graph shows what you linked. MemVector shows what you *believe*:
which ideas imply each other, which depend on each other, which contradict.
Declare a relation, and your notes move on a 2D canvas — related ideas pull
together, conflicting ones push apart. Your thinking becomes a map you can
navigate, query, and ask an AI about.

- **Relations you can read.** Every relation is a plain Markdown note with a type and a reason.
- **Meaning as layout.** Typed relations plus semantic similarity drive the canvas.
- **Ask your own map.** AI synthesis uses your declared structure as context.
- **Fully local.** Embeddings and graph live in one SQLite file in your vault. Works with Ollama, no API key needed.

---

## How it works

You are writing a thesis and have 200 notes, but no overview of which claims
support each other and which collide. Select two notes and declare how they
relate:

```
Utilitarianism        →  CONFLICTS_WITH  →  Kantian duty ethics
Natural selection     →  REQUIRES        →  Heritable variation
Bayes' theorem        →  GENERALIZES     →  Likelihood ratio
```

That one step does three things:

1. **The canvas rearranges.** `EQUIVALENT_TO` pulls notes close,
   `CONFLICTS_WITH` pushes them apart. The layout is your declared structure.
2. **A Markdown note appears in your vault** (`wiki/relations/` by default),
   with WikiLinks to both notes and your reason in plain text — readable,
   editable, searchable, version-controlled.
3. **The relation joins a local graph** that multi-hop lookups and AI
   synthesis can traverse.

Underneath, semantic embeddings act as a second force: notes with similar
content drift together even without a relation. Your declared relations win
where they are stronger; similarity fills the gaps.

MemVector does not replace Obsidian's graph, and it does not build the graph
for you — you decide what connects. The AI only steps in when you ask it to
synthesize.

---

## Installation & Quickstart

1. In **Settings → Community plugins → Browse**, search for **MemVector Knowledge Engine**, install and enable it.
2. Choose your embedding and LLM provider — Ollama with `bge-m3` works
   out of the box with no API key.
3. Click **"Index entire vault"** to compute embeddings.
4. Open the 2D canvas from the ribbon icon or command palette.
5. Select two notes (`Cmd`-click or `Shift`-drag lasso), then open
   the Relation Builder to declare your first typed relation.

---

## Relation types

Seventeen canonical types ship as a starting vocabulary. All are customizable
via `wiki/relation-types.json` in your vault — nothing is hardcoded.

| Type | Meaning | Force in canvas |
|------|---------|-----------------|
| `EQUIVALENT_TO` | Same concept, different formulation | Strongest pull (×1.3) |
| `ANALOGOUS_TO` | Structurally similar | Strong pull (×1.1) |
| `IMPLIES` | A makes B necessary | Standard (×1.0) |
| `REQUIRES` | A presupposes B | Standard (×1.0) |
| `DEFINED_BY` | A concept is defined by B | Standard (×1.0) |
| `USES` | A definition uses the simpler concept B | Standard (×1.0) |
| `GOVERNED_BY` | A primitive notion is governed by axiom B | Standard (×1.0) |
| `GENERALIZES` | A is the broader case | Standard (×1.0) |
| `SPECIALIZES` | A is a special case | Standard (×1.0) |
| `EXAMPLE_OF` | A is a concrete instance of concept B | Standard (×1.0) |
| `EXTENDS` | A builds on B | Standard (×1.0) |
| `CONSTRUCTS` | A constructs B | Standard (×1.0) |
| `EMBEDS_IN` | A is embedded in B | Standard (×1.0) |
| `REDUCES_TO` | A reduces to B | Standard (×1.0) |
| `REFUTES` | A refutes B | Standard (×1.0) |
| `CONFLICTS_WITH` | Active contradiction | **Active repulsion** |
| `INDEPENDENT_OF` | No connection | Neutral (×0.05) |

Each type has a dedicated color on the canvas. Custom types get a
deterministic color from a hash — no manual color assignment needed.

Force and repulsion are per-type data, not code: edit the `weight` / `repels`
columns in **Settings → Relation types**, or the vocabulary JSON directly. Add
your own types there, or switch the whole vocabulary to a bundled preset
(STEM, Law, Medicine, Philosophy) — existing edges keep working, since edge
labels are stored as plain strings.

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
- **Optional writes through Jovian.** If you run
  [Jovian](https://github.com/kevinkaupert/jovian), the setting "Write
  through Jovian" (off by default) saves synthesis and relation notes
  through its write gate: per-note lock, stale check and a journal of
  every write. See `docs/CONFIGURATION.md`. Without it, nothing changes.
- **Search from the command line.** `node cli.js search --vault <path>
  --query "<text>" --json` ranks your indexed notes by meaning without
  opening Obsidian, so other tools (e.g. Jovian's prerequisite check) can
  ask MemVector. Reads only. `node cli.js relation add` creates the relation
  note for one edge through Jovian's gate (Canvas Tutor uses it). See
  `docs/runbook.md`.

---

## Status: Early-Stage (Pre-1.0)

This plugin is at version `0.3.x` and under active development. The version
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

### Development & Contributing

- [**Runbook** (`docs/runbook.md`)](docs/runbook.md) — clone, build and test commands, linking the clone into a vault, the local mock server, inspecting the index, releasing
- [**Manual testing** (`docs/TESTING.md`)](docs/TESTING.md) — smoke test steps inside Obsidian

---

## License

Distributed under the [MIT License](LICENSE).
