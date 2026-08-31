import { TFile, type App } from "obsidian";
import { getGraphStore, getVectorStore } from "../../sync/storeFactory";
import type { MemVectorSettings } from "../../settings/types";
import { toSlug } from "../../noteSlug";
import { stripFrontmatter } from "../../noteContent";
import type { ScatterNode } from "./types";

export interface EnrichedNote {
  id: string;
  title: string;
  path: string;
  content: string;
  sources: ("vector" | "graph")[];
}

function averageEmbedding(vectors: number[][]): number[] | null {
  if (vectors.length === 0) return null;
  const dim = vectors[0].length;
  const sum = new Array(dim).fill(0);
  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) sum[i] += vec[i];
  }
  return sum.map((v) => v / vectors.length);
}

async function fetchVectorNeighbors(app: App, settings: MemVectorSettings, selected: ScatterNode[], limit: number): Promise<Map<string, EnrichedNote>> {
  const found = new Map<string, EnrichedNote>();
  const store = getVectorStore(app, settings);

  const rawEmbeddings: number[][] = [];
  for (const n of selected) {
    if (n.embedding && n.embedding.length > 0) {
      rawEmbeddings.push(n.embedding);
    } else {
      try {
        const stored = await store.getVector(n.path);
        if (stored && stored.length > 0) {
          n.embedding = stored;
          rawEmbeddings.push(stored);
        }
      } catch {
        // Stored vector not available
      }
    }
  }

  const queryVector = averageEmbedding(rawEmbeddings);
  if (!queryVector) return found;

  const hits = await store.search(queryVector, limit + selected.length);

  for (const hit of hits) {
    const path = hit.payload?.path;
    if (!path || selected.some((s) => s.path === path)) continue;
    const id = toSlug(hit.payload.title || path);
    let content = hit.payload.content || "";
    if (!content) {
      const file = app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) {
        content = stripFrontmatter(await app.vault.read(file)).slice(0, 500);
      }
    }
    found.set(id, { id, title: hit.payload.title || id, path, content: content.slice(0, 200), sources: ["vector"] });
    if (found.size >= limit) break;
  }
  return found;
}

async function fetchGraphNeighbors(app: App, settings: MemVectorSettings, selected: ScatterNode[], limit: number): Promise<Map<string, EnrichedNote>> {
  const found = new Map<string, EnrichedNote>();
  const ids = selected.map((n) => toSlug(n.id));
  const neighbors = await getGraphStore(app, settings).fetchNeighbors(ids, 2, limit + selected.length);

  for (const neighbor of neighbors) {
    if (selected.some((s) => s.path === neighbor.path)) continue;
    let content = "";
    const file = app.vault.getAbstractFileByPath(neighbor.path);
    if (file instanceof TFile) {
      content = stripFrontmatter(await app.vault.read(file)).slice(0, 200);
    }
    found.set(neighbor.id, { id: neighbor.id, title: neighbor.title, path: neighbor.path, content: content.slice(0, 200), sources: ["graph"] });
    if (found.size >= limit) break;
  }
  return found;
}

/**
 * Hybrid GraphRAG context: pulls in notes the user didn't select, via vector
 * similarity (needs embeddings already computed on the selected notes -
 * "Vektoren berechnen") and graph-neighborhood (needs a synced graph).
 * Either leg is skipped silently if its precondition isn't met or its
 * backend is unreachable - partial enrichment beats failing the whole
 * synthesis. Works the same regardless of which backend (Qdrant/Memgraph or
 * local SQLite) is currently configured for each.
 */
export async function enrichContext(app: App, settings: MemVectorSettings, selected: ScatterNode[], limitPerSource = 2): Promise<EnrichedNote[]> {
  const merged = new Map<string, EnrichedNote>();

  const [vectorResult, graphResult] = await Promise.allSettled([
    fetchVectorNeighbors(app, settings, selected, limitPerSource),
    fetchGraphNeighbors(app, settings, selected, limitPerSource),
  ]);

  if (vectorResult.status === "fulfilled") {
    vectorResult.value.forEach((note, id) => merged.set(id, note));
  } else {
    console.warn("MemVector: vector context enrichment skipped", vectorResult.reason);
  }

  if (graphResult.status === "fulfilled") {
    graphResult.value.forEach((note, id) => {
      const existing = merged.get(id);
      if (existing) {
        existing.sources.push("graph");
        if (!existing.content && note.content) existing.content = note.content;
      } else {
        merged.set(id, note);
      }
    });
  } else {
    console.warn("MemVector: graph context enrichment skipped", graphResult.reason);
  }

  return Array.from(merged.values());
}
