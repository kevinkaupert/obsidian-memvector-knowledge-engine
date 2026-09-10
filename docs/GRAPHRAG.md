# Hybrid GraphRAG Context Enrichment

## What this is

Until this feature, the vector and graph stores were **write-only**: the
plugin pushed embeddings and the note graph into them, but nothing ever
read that data back into the LLM synthesis feature. The "AI Co-Pilot" only
ever saw the notes you manually selected in the 2D graph — nothing more.

In v0.1.0, this operates 100% locally via the integrated SQLite storage engine (`memvector-local.sqlite`), while remaining backend-agnostic through the `VectorStore` and `GraphStore` interfaces (remote Qdrant / Memgraph connectors planned for v0.2+).

The `enrichSynthesisContext` setting (a toggle in the Synthesis toolbar
section, off by default; UI label is localized, `t.synthEnrichToggle` in
`src/i18n/`) closes that loop: before calling the LLM, the plugin now
pulls in notes you *didn't* select, from two independent sources, and
adds them to the prompt as background context.

## Workflow

1. Select one or more notes in the 2D vector graph, as usual.
2. Turn on the enrichment toggle in the Synthesis section of the floating
   toolbar (labelled "Kontext aus Vektoren + Graph anreichern" in German,
   "Enrich context from vectors + graph" in English).
3. Click the synthesize button (with or without a custom question in the
   text field above it).
4. Before the LLM call, the plugin runs two lookups in parallel:
   - **Vector Store (SQLite)**: averages the embedding vectors of your selected notes and
     runs a cosine similarity search against the whole vault's stored embeddings (requires
     "Vektoren berechnen" to have been executed at least once).
   - **Graph Store (SQLite CTEs)**: finds notes within 1–2 graph-hops of your selected
     notes — traversing plain WikiLinks *and* any typed relations created with the Relation Builder.
5. Results from both are merged (a note found by both is tagged as such)
   and appended to the prompt as a clearly-labelled "automatically found,
   related notes - background context only" section, separate from your
   actual selection. The LLM is instructed to keep its focus on the notes
   you selected and use the extra context only as background.
6. Either lookup is skipped silently (not a hard failure) if its precondition isn't met (e.g. no embeddings yet) -
   partial enrichment beats breaking the whole synthesis call.

## Why this actually helps (not just "sounds nice")

Vector similarity and graph structure catch **different kinds of misses**:

- **Vector similarity catches semantic-but-unlinked notes.** Two notes can be about
  the same underlying idea without ever WikiLinking each other - maybe you
  wrote them weeks apart and forgot the connection existed. Graph
  traversal will never find that note (there's no edge to walk); vector
  similarity will, because the *content* is close in embedding space.
- **Graph traversal catches structurally-linked-but-not-content-similar notes.**
  A definition and a theorem that depends on it (`REQUIRES`) or two
  notions you explicitly marked as `IS_OPPOSITE_OF` via the Relation
  Builder might use completely different vocabulary and not look
  "similar" in embedding space at all - but they're clearly relevant, and
  the graph knows it explicitly because you told it so.
  "similar" in embedding space at all - but they're clearly relevant, and
  the graph knows it explicitly because you told it so.

Neither source alone covers both cases. That's the actual argument for
*hybrid* retrieval instead of picking one.

### Synthetic proof (not just a claim)

This was verified directly rather than assumed. Four disposable test
notes were used:

- `Testkonzept-A → Testkonzept-B → Testkonzept-C`: linked in a WikiLink
  chain (a graph-only connection), synced to Memgraph.
- `Testkonzept-C -[IS_OPPOSITE_OF]-> Testkonzept-A`: a typed relation
  created via the Relation Builder, live-pushed to Memgraph.
- `Testkonzept-D`: near-identical wording to Testkonzept-A, but **zero**
  WikiLinks to any of the other three - deliberately graph-isolated.

Selecting **only** `Testkonzept-A` and calling the real `enrichContext()`
function (not a mock) produced:

```
Found 4 additional notes NOT selected by the user:
  - [qdrant] Testkonzept-D                                  <- found by content similarity alone
  - [qdrant+memgraph] Testkonzept-B                          <- found by both
  - [qdrant+memgraph] Testkonzept-C                          <- found by both
  - [memgraph] rel-Testkonzept-C-to-Testkonzept-A            <- the relation note itself
```

`Testkonzept-D` is the key result: it has no graph path to `A` at all, so
Memgraph could never have found it - only the Qdrant leg did, purely from
content. This is direct, reproducible evidence that the hybrid approach
finds context a graph-only or vector-only design would each miss half of.

(Known minor quirk surfaced by the same test: relation `.md` files
themselves show up as graph nodes, since the whole-vault Memgraph sync
treats every markdown file uniformly. Not incorrect, just a bit noisy -
worth filtering out in a future pass if it turns out to matter in
practice.)

### Bug this test caught before shipping

The first run of the synthetic test failed with a genuine Memgraph error:
`Limit on number of returned elements must be an integer` - Memgraph
rejects a parameterized `LIMIT` even when the JS value genuinely is an
integer (`neo4j-driver-lite` sends plain numbers as floats). Fixed in
`sync/memgraph/graphNeighbors.ts` by inlining the already-validated,
internally-clamped `hops`/`limit` values into the query text instead of
passing them as bound parameters (the same reasoning already applied to
`sanitizeRelType` elsewhere in this codebase - safe because these values
are never raw user text, only internally-computed integers).

## Relevant files

- `src/views/vectorScatter/contextEnrichment.ts` - orchestrates both legs (vector similarity + graph hops), merges results, degrades gracefully.
- `src/sync/sqlite/sqliteVectorStore.ts` (`search`) - local SQLite cosine similarity vector search.
- `src/sync/sqlite/sqliteGraphQueries.ts` (`fetchGraphNeighborsSqlite`) - local SQLite CTE graph-traversal query.
- `src/sync/qdrant/qdrantClient.ts` (`searchSimilar`) - remote Qdrant vector search adapter (v0.2+).
- `src/sync/memgraph/graphNeighbors.ts` (`fetchGraphNeighbors`) - remote Memgraph graph-traversal adapter (v0.2+).
- `src/views/vectorScatter/synthesis.ts` (`buildEnrichedSection`) - folds the enrichment results into the LLM prompt.
