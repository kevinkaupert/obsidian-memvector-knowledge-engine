import { TFile, type App } from "obsidian";
import { fetchGraphNeighbors } from "../../sync/memgraph/graphNeighbors";
import { searchSimilar } from "../../sync/qdrant/qdrantClient";
import type { MemVectorSettings } from "../../settings/types";
import { toSlug } from "../../noteSlug";
import { stripFrontmatter } from "../../noteContent";
import type { ScatterNode } from "./types";

export interface EnrichedNote {
  id: string;
  title: string;
  path: string;
  content: string;
  sources: ("qdrant" | "memgraph")[];
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

async function fetchQdrantNeighbors(settings: MemVectorSettings, selected: ScatterNode[], limit: number): Promise<Map<string, EnrichedNote>> {
  const found = new Map<string, EnrichedNote>();
  const embeddings = selected.map((n) => n.embedding).filter((e): e is number[] => !!e && e.length > 0);
  const queryVector = averageEmbedding(embeddings);
  if (!queryVector) return found;

  const baseUrl = (settings.qdrantUrl || "http://localhost:6333").replace(/\/+$/, "");
  const hits = await searchSimilar(baseUrl, settings.qdrantCollection || "obsidian_wiki_vectors", settings.qdrantApiKey, queryVector, limit + selected.length);

  for (const hit of hits) {
    const path = hit.payload?.path;
    if (!path || selected.some((s) => s.path === path)) continue;
    const id = toSlug(hit.payload.title || path);
    found.set(id, { id, title: hit.payload.title, path, content: hit.payload.content || "", sources: ["qdrant"] });
    if (found.size >= limit) break;
  }
  return found;
}

async function fetchMemgraphNeighbors(app: App, settings: MemVectorSettings, selected: ScatterNode[], limit: number): Promise<Map<string, EnrichedNote>> {
  const found = new Map<string, EnrichedNote>();
  const ids = selected.map((n) => toSlug(n.id));
  const neighbors = await fetchGraphNeighbors(settings, ids, 2, limit + selected.length);

  for (const neighbor of neighbors) {
    if (selected.some((s) => s.path === neighbor.path)) continue;
    let content = "";
    const file = app.vault.getAbstractFileByPath(neighbor.path);
    if (file instanceof TFile) {
      content = stripFrontmatter(await app.vault.read(file)).slice(0, 500);
    }
    found.set(neighbor.id, { id: neighbor.id, title: neighbor.title, path: neighbor.path, content, sources: ["memgraph"] });
    if (found.size >= limit) break;
  }
  return found;
}

/**
 * Hybrid GraphRAG context: pulls in notes the user didn't select, via Qdrant
 * vector similarity (needs embeddings already computed on the selected
 * nodes - "Vektoren berechnen") and Memgraph graph-neighborhood (needs a
 * synced graph). Either leg is skipped silently if its precondition isn't
 * met or its database is unreachable - partial enrichment beats failing the
 * whole synthesis.
 */
export async function enrichContext(app: App, settings: MemVectorSettings, selected: ScatterNode[], limitPerSource = 4): Promise<EnrichedNote[]> {
  const merged = new Map<string, EnrichedNote>();

  const [qdrantResult, memgraphResult] = await Promise.allSettled([
    fetchQdrantNeighbors(settings, selected, limitPerSource),
    fetchMemgraphNeighbors(app, settings, selected, limitPerSource),
  ]);

  if (qdrantResult.status === "fulfilled") {
    qdrantResult.value.forEach((note, id) => merged.set(id, note));
  } else {
    console.warn("MemVector: Qdrant context enrichment skipped", qdrantResult.reason);
  }

  if (memgraphResult.status === "fulfilled") {
    memgraphResult.value.forEach((note, id) => {
      const existing = merged.get(id);
      if (existing) {
        existing.sources.push("memgraph");
        if (!existing.content && note.content) existing.content = note.content;
      } else {
        merged.set(id, note);
      }
    });
  } else {
    console.warn("MemVector: Memgraph context enrichment skipped", memgraphResult.reason);
  }

  return Array.from(merged.values());
}
