import { TFile, type App } from "obsidian";
import { getGraphStore, getVectorStore } from "../../sync/storeFactory";
import type { MemVectorSettings } from "../../settings/types";
import { pathToId } from "../../noteSlug";
import { capText, stripFrontmatter } from "../../noteContent";
import type { ScatterNode } from "./types";
import { shouldIncludeFile } from "./vaultScan";

export interface EnrichedNote {
  id: string;
  title: string;
  path: string;
  content: string;
  sources: ("vector" | "graph")[];
  /** Graph hop distance from the selection (graph-sourced notes only) - used for hop-balanced assembly (Issue #103). */
  hops?: number;
  /** Cosine similarity to the selection's centroid (vector-sourced notes only) - shown in the context preview. */
  similarity?: number;
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
 * Architecture: settings.vectorNeighborLimit caps how many vector hits enter the context - 0 = unlimited (Issue #103).
 */
async function fetchVectorNeighbors(
  app: App,
  settings: MemVectorSettings,
  selected: ScatterNode[],
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
          rawEmbeddings.push(stored);
        }
      } catch {
        // Stored vector not available
      }
    }
  }

  const queryVector = averageEmbedding(rawEmbeddings);
  if (!queryVector) return found;

  const limit = settings.vectorNeighborLimit ?? 2;
  // 0 = unlimited count: search unconstrained without an arbitrary 100-note cap.
  // Relevance is still scoped by minVectorSimilarity below, so "unlimited" never means
  // "the whole vault" - only notes actually related to the selection (Issue #103).
  const searchLimit = limit > 0 ? limit + selected.length : 0;
  const hits = await store.search(queryVector, searchLimit);
  const minSim = settings.minVectorSimilarity ?? 0;

  for (const hit of hits) {
    if (minSim > 0 && hit.score < minSim) continue;
    const path = hit.payload?.path;
    if (!path || selected.some((s) => s.path === path)) continue;
    // A deleted note's stored vector/content can still be a stale hit here between
    // full re-indexes (which reconcile it away) - re-check the file actually exists
    // rather than trusting the stored payload content.
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) continue;
    // Enforce current exclusions before reading content, even with a stale index.
    if (!shouldIncludeFile(file, settings.vectorSearchExclusions)) continue;
    const id = pathToId(path);
    const rawContent = await app.vault.cachedRead(file);
    const freshBody = stripFrontmatter(rawContent);
    const content = freshBody || hit.payload?.content || "";
    found.set(id, {
      id,
      title: hit.payload?.title || id,
      path,
      content: capText(content, excerptLength),
      sources: ["vector"],
      similarity: hit.score,
    });
    if (limit > 0 && found.size >= limit) break;
  }
  return found;
}

/**
 * Purpose: Retrieves topological multi-hop neighbors from the graph store, reading fresh full note bodies from the vault.
 * Architecture: Per-hop-level quota (settings.hopLevelNeighborLimit, 0 = unlimited) so a dense hop-1 neighborhood cannot crowd deeper hops out of the GraphRAG context (Issue #103). The store query runs unconstrained (Issue #115) - no hidden SQL-side caps or slack multipliers - and the explicit per-hop user quota is applied transparently client-side.
 */
async function fetchGraphNeighbors(
  app: App,
  settings: MemVectorSettings,
  selected: ScatterNode[],
  excerptLength: number,
  hopDepth = settings.synthesisHopDepth ?? 2
): Promise<Map<string, EnrichedNote>> {
  const found = new Map<string, EnrichedNote>();
  const ids = selected.map((n) => n.id);
  const perHop = settings.hopLevelNeighborLimit ?? 2;
  const hops = Math.max(1, Math.trunc(hopDepth));
  // 0 = unconstrained: every reachable candidate comes back and the per-hop
  // quota below decides admission - no arbitrary 3x slack or global LIMIT can
  // silently cut off deeper hops (Issue #115).
  const neighbors = await getGraphStore(app, settings).fetchNeighbors(ids, hops, 0, 0);

  const perHopCount = new Map<number, number>();
  const seen = new Set<string>();
  for (const neighbor of neighbors) {
    if (seen.has(neighbor.id)) continue;
    seen.add(neighbor.id);
    if (selected.some((s) => s.path === neighbor.path)) continue;
    // A stale graph edge to a since-deleted note can still surface here between
    // full re-indexes (which reconcile it away) - skip it rather than serve empty
    // or (if the id happens to have been reused) wrong content.
    const file = app.vault.getAbstractFileByPath(neighbor.path);
    if (!(file instanceof TFile)) continue;
    // Enforce current exclusions before reading content, even with a stale index.
    if (!shouldIncludeFile(file, settings.vectorSearchExclusions)) continue;
    const hop = neighbor.hops || 1;
    const used = perHopCount.get(hop) ?? 0;
    if (perHop > 0 && used >= perHop) continue;
    perHopCount.set(hop, used + 1);
    const content = stripFrontmatter(await app.vault.cachedRead(file));
    found.set(neighbor.id, {
      id: neighbor.id,
      title: neighbor.title,
      path: neighbor.path,
      content: capText(content, excerptLength),
      sources: ["graph"],
      hops: hop,
    });
  }
  return found;
}

/**
 * Purpose: Assembles graph notes in hop-balanced round-robin order so trimming to the total budget cannot crowd deeper hops out (Issue #103).
 */
function orderGraphNotesHopBalanced(notes: EnrichedNote[]): EnrichedNote[] {
  const byHop = new Map<number, EnrichedNote[]>();
  for (const note of notes) {
    const hop = note.hops ?? 1;
    const bucket = byHop.get(hop);
    if (bucket) bucket.push(note);
    else byHop.set(hop, [note]);
  }
  const levels = Array.from(byHop.keys()).sort((a, b) => a - b);
  const ordered: EnrichedNote[] = [];
  for (let round = 0; ordered.length < notes.length; round++) {
    let progressed = false;
    for (const level of levels) {
      const bucket = byHop.get(level)!;
      if (round < bucket.length) {
        ordered.push(bucket[round]);
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return ordered;
}

/**
 * Purpose: Orchestrates hybrid GraphRAG context enrichment across semantic vector search and graph topology.
 * Architecture: All context caps come from settings (vectorNeighborLimit, hopLevelNeighborLimit, totalContextLimit) with 0 = unlimited - no hidden model-tier budget (Issue #103).
 */
export async function enrichContext(
  app: App,
  settings: MemVectorSettings,
  selected: ScatterNode[],
  excerptLength = 200,
  hopDepth = settings.synthesisHopDepth ?? 2
): Promise<EnrichedNote[]> {
  // 0 = unlimited total context; no silent trimming unless the user sets a cap.
  const maxTotal = settings.totalContextLimit ?? 0;

  const [vectorResult, graphResult] = await Promise.allSettled([
    fetchVectorNeighbors(app, settings, selected, excerptLength),
    fetchGraphNeighbors(app, settings, selected, excerptLength, hopDepth),
  ]);

  const vectorNotes = vectorResult.status === "fulfilled"
    ? Array.from(vectorResult.value.values())
    : [];
  if (vectorResult.status === "rejected") {
    console.warn("MemVector: vector context enrichment skipped", vectorResult.reason);
  }

  const graphNotes = graphResult.status === "fulfilled"
    ? orderGraphNotesHopBalanced(Array.from(graphResult.value.values()))
    : [];
  if (graphResult.status === "rejected") {
    console.warn("MemVector: graph context enrichment skipped", graphResult.reason);
  }

  return assembleContextNotes(vectorNotes, graphNotes, maxTotal);
}

/**
 * Purpose: Assembles vector and graph notes into a final enriched context list up to maxTotal.
 * Architecture: Prioritizes dual-confirmed notes (vector + graph), then interleaves vector (semantic)
 * and graph (hop-balanced) channels fairly so vector hits cannot crowd out topological graph neighbors
 * when totalContextLimit is bounded (Issue #110).
 */
export function assembleContextNotes(
  vectorNotes: EnrichedNote[],
  graphNotes: EnrichedNote[],
  maxTotal: number
): EnrichedNote[] {
  const noteMap = new Map<string, EnrichedNote>();
  const graphMap = new Map<string, EnrichedNote>(graphNotes.map((n) => [n.id, n]));

  const dualNotes: EnrichedNote[] = [];
  const onlyVector: EnrichedNote[] = [];

  for (const v of vectorNotes) {
    const g = graphMap.get(v.id);
    if (g) {
      const combined: EnrichedNote = {
        ...v,
        sources: ["vector", "graph"],
        hops: g.hops,
        content: v.content || g.content,
      };
      noteMap.set(v.id, combined);
      dualNotes.push(combined);
    } else {
      noteMap.set(v.id, v);
      onlyVector.push(v);
    }
  }

  const onlyGraph: EnrichedNote[] = [];
  for (const g of graphNotes) {
    if (!noteMap.has(g.id)) {
      noteMap.set(g.id, g);
      onlyGraph.push(g);
    }
  }

  if (maxTotal <= 0) {
    return [...dualNotes, ...onlyVector, ...onlyGraph];
  }

  const result: EnrichedNote[] = [];
  for (const dual of dualNotes) {
    if (result.length >= maxTotal) return result;
    result.push(dual);
  }

  let vIdx = 0;
  let gIdx = 0;
  while (result.length < maxTotal && (vIdx < onlyVector.length || gIdx < onlyGraph.length)) {
    if (vIdx < onlyVector.length) {
      result.push(onlyVector[vIdx++]);
      if (result.length >= maxTotal) break;
    }
    if (gIdx < onlyGraph.length) {
      result.push(onlyGraph[gIdx++]);
      if (result.length >= maxTotal) break;
    }
  }

  return result;
}
