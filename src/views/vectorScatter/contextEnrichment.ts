import { TFile, type App } from "obsidian";
import { getGraphStore, getVectorStore } from "../../sync/storeFactory";
import type { MemVectorSettings } from "../../settings/types";
import { pathToId } from "../../noteSlug";
import { capText, stripFrontmatter } from "../../noteContent";
import type { ScatterNode } from "./types";

export interface EnrichedNote {
  id: string;
  title: string;
  path: string;
  content: string;
  sources: ("vector" | "graph")[];
}

/**
 * Purpose: Computes centroid query vector by averaging high-dimensional embeddings across selected notes.
 */
function averageEmbedding(vectors: number[][]): number[] | null {
  if (vectors.length === 0) return null;
  const dim = vectors[0].length;
  const sum = new Array(dim).fill(0);
  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) sum[i] += vec[i];
  }
  return sum.map((v) => v / vectors.length);
}

/**
 * Purpose: Retrieves semantic nearest neighbors via vector search, reading fresh full note bodies from the vault.
 */
async function fetchVectorNeighbors(
  app: App,
  settings: MemVectorSettings,
  selected: ScatterNode[],
  limit: number,
  excerptLength: number
): Promise<Map<string, EnrichedNote>> {
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
    // A deleted note's stored vector/content can still be a stale hit here between
    // full re-indexes (which reconcile it away) - re-check the file actually exists
    // rather than trusting the stored payload content.
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) continue;
    const id = pathToId(path);
    const rawContent = await app.vault.cachedRead(file);
    const freshBody = stripFrontmatter(rawContent);
    const content = freshBody || hit.payload?.content || "";
    found.set(id, { id, title: hit.payload?.title || id, path, content: capText(content, excerptLength), sources: ["vector"] });
    if (found.size >= limit) break;
  }
  return found;
}

/**
 * Purpose: Retrieves topological multi-hop neighbors from the graph store, reading fresh full note bodies from the vault.
 */
async function fetchGraphNeighbors(
  app: App,
  settings: MemVectorSettings,
  selected: ScatterNode[],
  limit: number,
  excerptLength: number
): Promise<Map<string, EnrichedNote>> {
  const found = new Map<string, EnrichedNote>();
  const ids = selected.map((n) => n.id);
  const neighbors = await getGraphStore(app, settings).fetchNeighbors(ids, 2, limit + selected.length);

  for (const neighbor of neighbors) {
    if (selected.some((s) => s.path === neighbor.path)) continue;
    // A stale graph edge to a since-deleted note can still surface here between
    // full re-indexes (which reconcile it away) - skip it rather than serve empty
    // or (if the id happens to have been reused) wrong content.
    const file = app.vault.getAbstractFileByPath(neighbor.path);
    if (!(file instanceof TFile)) continue;
    const content = stripFrontmatter(await app.vault.cachedRead(file));
    found.set(neighbor.id, { id: neighbor.id, title: neighbor.title, path: neighbor.path, content: capText(content, excerptLength), sources: ["graph"] });
    if (found.size >= limit) break;
  }
  return found;
}

/**
 * Purpose: Orchestrates hybrid GraphRAG context enrichment across semantic vector search and graph topology.
 */
export async function enrichContext(
  app: App,
  settings: MemVectorSettings,
  selected: ScatterNode[],
  limitPerSource = 2,
  excerptLength = 200,
  maxTotal = 4
): Promise<EnrichedNote[]> {
  const merged = new Map<string, EnrichedNote>();

  const [vectorResult, graphResult] = await Promise.allSettled([
    fetchVectorNeighbors(app, settings, selected, limitPerSource, excerptLength),
    fetchGraphNeighbors(app, settings, selected, limitPerSource, excerptLength),
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
        if (merged.size < maxTotal) {
          merged.set(id, note);
        }
      }
    });
  } else {
    console.warn("MemVector: graph context enrichment skipped", graphResult.reason);
  }

  return Array.from(merged.values()).slice(0, maxTotal);
}
