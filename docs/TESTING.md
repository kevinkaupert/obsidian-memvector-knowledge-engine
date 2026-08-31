# Manual Integration Testing: Qdrant + Memgraph

This procedure only applies if you're using the **Qdrant/Memgraph** backends
(Settings → Vector/Graph Backend). If you're on the **Local (SQLite)**
backend instead, there's no external service to verify against — sync
failures surface directly as a `Notice` from the same-process SQLite write,
and the automated test suite (`sqliteGraphStore.test.ts`,
`sqliteVectorStore.test.ts`) already exercises that code path against a real
`sql.js` engine.

The plugin's own success `Notice`s aren't proof anything actually landed in the
external database — this repo's own history has a case where a sync button
reported success while doing nothing (see `ARCHITECTURE.md`). This is a small,
repeatable procedure to verify Qdrant and Memgraph sync end-to-end using
disposable, clearly-labelled synthetic notes, independent of the plugin's UI.

## Prerequisites

- Qdrant reachable (default `http://localhost:6333`).
- Memgraph reachable over Bolt (default `bolt://localhost:7687`).
- For Qdrant specifically: an embedding provider configured and reachable
  (e.g. local Ollama with the configured model pulled — `ollama pull bge-m3`).
- `curl` and `python3` for the verification commands below. For Memgraph,
  either [Memgraph Lab](http://localhost:3005) (adjust port to your setup) or
  `mgconsole` if installed.

## 1. Create synthetic test notes

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

## 2. Run the plugin's sync buttons

In Obsidian: **Settings → MemVector Knowledge Engine**:

1. Qdrant section → **"Qdrant-Verbindung testen"** → expect ✅.
2. Qdrant section → **"Jetzt Vault in Qdrant synchronisieren"**.
3. Memgraph section → **"Memgraph Verbindung testen"** → expect ✅.
4. Memgraph section → **"Jetzt Vault-Graph in Memgraph synchronisieren"**.

## 3. Verify independently (don't trust the Notice alone)

### Qdrant

```bash
curl -s http://localhost:6333/collections/obsidian_wiki_vectors/points/scroll \
  -H "Content-Type: application/json" \
  -d '{"filter": {"must": [{"key": "path", "match": {"text": "_synctest"}}]}, "limit": 10, "with_payload": true}' \
  | python3 -m json.tool
```

Expect 3 points whose `payload.path` starts with `_synctest/`.

### Memgraph

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

### Relation Builder + live Memgraph push (optional)

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

## 4. Clean up

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
