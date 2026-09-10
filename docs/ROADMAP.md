# MemVector Knowledge Engine — Roadmap & Ausgelagerte Features

Dieses Dokument führt alle bewusst für den stabilen **v0.1 Public Release** reduzierten, ausgelagerten oder für spätere Versionen geplanten Funktionserweiterungen auf.

---

## Status v0.1.0 (Public Core)

Die Version **v0.1.0** konzentriert sich auf maximale Stabilität, Portabilität und Zero-Setup-Nutzung:
* **100% Local-First SQLite-Backend** (`sql.js`): Vektoren und Graph-Topologie ohne externe Server in `memvector-local.sqlite`.
* **GraphVektor 2D-Projektion**: Physikbasierte Force-Simulation, die semantische Cosine-Distanz, WikiLinks und typisierte Relationen nahtlos kombiniert.
* **Mini-Radar Seitenleiste**: Echte Polardistanzen basierend auf $(1 - \text{Cosine Similarity})$.
* **Hybrid GraphRAG Synthese**: Automatische Anreicherung von LLM-Prompts durch Vektornachbarn und Graph-Traversierung aus der lokalen Datenbank.
* **Typisierter Beziehungs-Editor**: Erstellung von semantischen Kanten-Notizen (`wiki/relations/`) und automatische Synchronisation.

---

## Zukünftige Erweiterungen & Roadmap (v0.2+)

### 1. Optionale Remote-Server-Adapter (Enterprise / >50k Notizen)
* **Qdrant Vector Database Adapter**: Optionales Backend für extrem große Vaults (>50.000 Notizen), bei denen In-Memory-WASM an Performancegrenzen stößt.
* **Memgraph / Neo4j Bolt Adapter**: Optionales Backend für hochkomplexe Multi-Hop Graph-Abfragen und Cypher-Workflows.
* *Design-Prinzip*: Die Server-Adapter werden als optionale Plugins/Module realisiert, ohne den schlanken Kern zu überfrachten.

### 2. Automatischer Vault-Event-Watcher (Background Sync)
* Intelligentes Re-Indexing geänderter Markdown-Dateien im Hintergrund (mit Debounce und Diff-Check).
* Automatisches Berechnen von Embeddings für neu erstellte Notizen, sobald der Editor geschlossen wird.

### 3. LLM-gestützter Kanten-Suggester (Relation Suggester)
* Einbindung des LLMs beim Erstellen von Beziehungen, um automatisch passende semantische Relationstypen aus dem Vokabular (`wiki/relation-types.json`) vorzuschlagen.

### 4. 3D Vektorraum-Projektion (Optionales WebGL/Three.js Modul)
* Dreidimensionale Erkundung des Vault-Wissensraums mit interaktiver Flug-Navigation.
