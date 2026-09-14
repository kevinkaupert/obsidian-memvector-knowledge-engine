# Manual Integration Testing

## Local (SQLite) — current default (v0.1.x)

This is the engine every install actually uses today. Automated coverage
lives in `npm test` (Vitest, no external dependencies); this section is the
manual, real-Obsidian smoke test for the parts automated tests can't reach
(the plugin only imports real Obsidian classes, e.g. `TFile`/`Notice`, at
runtime — that surface has to be exercised in an actual Obsidian window).

Use a disposable test vault (a throwaway folder, never your real vault) with
`main.js`, `manifest.json`, `styles.css`, and `sql-wasm.wasm` copied into
`.obsidian/plugins/memvector-knowledge-engine/`, then enable the plugin
(Settings → Community plugins → turn off Restricted mode → enable MemVector).

1. **Indexing.** Create two notes where one links to the other
   (`[[Other Note]]`). Settings → MemVector → **"Jetzt Vault lokal
   indizieren"** → expect a `[OK]` success notice with a non-zero
   vector/edge count and no `[ERROR]` in the developer console.
2. **Restart-persistence.** Close and reopen the 2D graph view (or restart
   Obsidian). Open the developer console and run:
   ```js
   app.workspace.getLeavesOfType('math-vector-scatterplot-view')[0].view.nodes
     .map(n => ({ title: n.title, hasEmbedding: !!(n.embedding && n.embedding.length) }))
   ```
   Every indexed note should report `hasEmbedding: true` immediately, without
   any embedding recompute.
3. **Relation creation.** Select both notes, create a typed relation, save.
   Confirm a file appears under `wiki/relations/`. Create a *second*, 
   differently-typed relation between the same pair and confirm a *second*
   file appears (not an overwrite of the first).
4. **Deletion + reconciliation.** Delete one of the two notes, then
   re-run **"Jetzt Vault lokal indizieren"**. The deleted note's edge/vector
   must be gone afterward - it must not still surface as GraphRAG context for
   the remaining note.
5. **Synthesis prompt capture.** Point the LLM provider ("Custom REST
   Endpoint") at a local script that logs the raw request body and returns a
   canned response, e.g.:
   ```js
   // node mock-echo.js — logs the request, then answers with the exact
   // prompt it received, so the synthesis result modal shows it directly.
   const http = require("http");
   http.createServer((req, res) => {
     let body = ""; req.on("data", c => body += c);
     req.on("end", () => {
       console.log(body);
       if (req.url.includes("/models")) return res.end(JSON.stringify({ data: [{ id: "mock" }] }));
       const prompt = JSON.parse(body).messages.find(m => m.role === "user").content;
       res.end(JSON.stringify({ choices: [{ message: { content: prompt } }] }));
     });
   }).listen(8092);
   ```
   Set `apiBaseUrl` to `http://localhost:8092/v1`, run synthesis, and read
   the echoed prompt in the result modal to confirm GraphRAG enrichment,
   AGENTS.md guidelines, and any free-text question actually reached it.

This whole procedure - and the finding that the plugin's own success
`Notice`s aren't proof anything actually landed in storage - is exactly what
surfaced several real bugs during the 2026-09-14 functional review (tracked
in issue #7 and its linked findings); it's worth re-running after any change
to indexing, relation storage, or synthesis prompt construction.

## Remote backends (Qdrant + Memgraph) — not implemented yet

> [!WARNING]
> The settings buttons referenced below ("Qdrant-Verbindung testen",
> "Memgraph Verbindung testen", etc.) **do not exist in the current v0.1.x
> UI** - `src/sync/qdrant/` and `src/sync/memgraph/` are not present in this
> codebase. This section documents the intended manual-verification
> procedure for when those backends are actually built (see `ROADMAP.md`),
> kept here so the plan isn't lost - it is not a testing procedure you can
> run today.

### Prerequisites (once built)

- Qdrant reachable (default `http://localhost:6333`).
- Memgraph reachable over Bolt (default `bolt://localhost:7687`).
- For Qdrant specifically: an embedding provider configured and reachable
  (e.g. local Ollama with the configured model pulled — `ollama pull bge-m3`).
- `curl` and `python3` for the verification commands below. For Memgraph,
  either [Memgraph Lab](http://localhost:3005) (adjust port to your setup) or
  `mgconsole` if installed.

### 1. Create synthetic test notes

Create a disposable folder, e.g. `_synctest/`, with three notes forming a
known chain A → B → C:

**`_synctest/Testkonzept-A.md`**
```markdown
# Testkonzept A
Dies ist eine synthetische Testnotiz für den Sync-Integrationstest. Sie verlinkt zu [[Testkonzept-B]].
```

**`_synctest/Testkonzept-B.md`**
```markdown
# Testkonzept B
Verlinkt weiter zu [[Testkonzept-C]].
```

**`_synctest/Testkonzept-C.md`**
```markdown
# Testkonzept C
Eigenständige Notiz ohne weitere Links, dient als Endpunkt der Test-Kette A → B → C.
```

Expected resulting graph: 3 nodes, 2 `LINKS_TO` edges (`testkonzept-a → testkonzept-b`, `testkonzept-b → testkonzept-c`).

### 2. Run the plugin's sync buttons

In Obsidian: **Settings → MemVector Knowledge Engine**:

1. Qdrant section → **"Qdrant-Verbindung testen"** → expect `[OK]`.
2. Qdrant section → **"Jetzt Vault in Qdrant synchronisieren"**.
3. Memgraph section → **"Memgraph Verbindung testen"** → expect `[OK]`.
4. Memgraph section → **"Jetzt Vault-Graph in Memgraph synchronisieren"**.

### 3. Verify independently (don't trust the Notice alone)

#### Qdrant

```bash
curl -s http://localhost:6333/collections/obsidian_wiki_vectors/points/scroll \
  -H "Content-Type: application/json" \
  -d '{"filter": {"must": [{"key": "path", "match": {"text": "_synctest"}}]}, "limit": 10, "with_payload": true}' \
  | python3 -m json.tool
```

Expect 3 points whose `payload.path` starts with `_synctest/`.

#### Memgraph

In Memgraph Lab or `mgconsole`:

```cypher
MATCH (a:Note)-[:LINKS_TO]->(b:Note)
WHERE a.path STARTS WITH "_synctest/"
RETURN a.id, b.id
ORDER BY a.id
```

Expect exactly:
```
testkonzept-a | testkonzept-b
testkonzept-b | testkonzept-c
```

#### Relation Builder + live Memgraph push (optional)

If you also want to verify the Relation Builder's direct-to-Memgraph push
(requires the "Automatische Cypher-Ausführung" toggle enabled in Memgraph
settings): select two of the three test notes in the 2D graph view, open
"Beziehung erstellen", save a relation, then check for the specific
relationship type you chose:

```cypher
MATCH (a:Note)-[r]->(b:Note)
WHERE a.path STARTS WITH "_synctest/" AND type(r) <> "LINKS_TO"
RETURN a.id, type(r), r.description, b.id
```

### 4. Clean up

Delete the `_synctest/` folder in Obsidian, then remove the synthetic data
from both databases (re-running the sync buttons only ever adds/updates via
`MERGE`, it never deletes):

```cypher
MATCH (n:Note) WHERE n.path STARTS WITH "_synctest/" DETACH DELETE n
```

```bash
curl -s -X POST http://localhost:6333/collections/obsidian_wiki_vectors/points/delete \
  -H "Content-Type: application/json" \
  -d '{"filter": {"must": [{"key": "path", "match": {"text": "_synctest"}}]}}'
```
