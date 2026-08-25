import type { ScatterNode } from "../types";

export interface SimilarityWeights {
  vector: number;
  wikiLinks: number;
  folder: number;
  semantics: number;
}

/** Normalizes raw 0-100 settings weights to sum to 1. */
export function normalizeWeights(raw: SimilarityWeights): SimilarityWeights {
  const total = raw.vector + raw.wikiLinks + raw.folder + raw.semantics || 1;
  return {
    vector: raw.vector / total,
    wikiLinks: raw.wikiLinks / total,
    folder: raw.folder / total,
    semantics: raw.semantics / total,
  };
}

/** Hybrid similarity S(a,b) blending embedding cosine similarity, word/formula overlap, wikilinks, and folder co-location. */
export function calcSimilarity(a: ScatterNode, b: ScatterNode, weights: SimilarityWeights, isMath: boolean): number {
  let vecSim = 0;
  if (a.embedding && b.embedding && a.embedding.length === b.embedding.length) {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let k = 0; k < a.embedding.length; k++) {
      dot += a.embedding[k] * b.embedding[k];
      normA += a.embedding[k] * a.embedding[k];
      normB += b.embedding[k] * b.embedding[k];
    }
    if (normA > 0 && normB > 0) {
      vecSim = Math.max(0, Math.min(1, (dot / (Math.sqrt(normA) * Math.sqrt(normB)) + 1) / 2));
    }
  }

  const wordsA = new Set((a.content || "").toLowerCase().match(/\b[a-z0-9_]{3,}\b/g) || []);
  const wordsB = new Set((b.content || "").toLowerCase().match(/\b[a-z0-9_]{3,}\b/g) || []);
  let wordIntersect = 0;
  wordsA.forEach((w) => {
    if (wordsB.has(w)) wordIntersect++;
  });
  const wordUnion = Math.max(1, wordsA.size + wordsB.size - wordIntersect);
  const wordSim = wordIntersect / wordUnion;

  const formsA = new Set(a.latexFormulas || []);
  const formsB = new Set(b.latexFormulas || []);
  let formIntersect = 0;
  formsA.forEach((f) => {
    if (formsB.has(f)) formIntersect++;
  });
  const formSim = formsA.size + formsB.size > 0 ? formIntersect / Math.max(1, Math.min(formsA.size, formsB.size)) : 0;

  const isWikiLinked = (a.links && a.links.includes(b.id.toLowerCase())) || (b.links && b.links.includes(a.id.toLowerCase()));
  const linkSim = isWikiLinked ? 0.75 : 0;

  const folderA = a.path.split("/").slice(0, -1).join("/");
  const folderB = b.path.split("/").slice(0, -1).join("/");
  const folderSim = folderA && folderA === folderB ? 0.4 : 0;

  const semSim = isMath ? formSim : wordSim;

  if (a.embedding && b.embedding) {
    return Math.min(1.0, vecSim * weights.vector + linkSim * weights.wikiLinks + folderSim * weights.folder + semSim * weights.semantics);
  }
  const adjustedSemWeight = weights.semantics + weights.vector * 0.5;
  const adjustedLinkWeight = weights.wikiLinks + weights.vector * 0.5;
  return Math.min(1.0, semSim * adjustedSemWeight + linkSim * adjustedLinkWeight + folderSim * weights.folder);
}

/** Full pairwise similarity matrix, symmetric, diagonal = 1. */
export function buildSimilarityMatrix(nodes: ScatterNode[], weights: SimilarityWeights, isMath: boolean): number[][] {
  const n = nodes.length;
  const matrix: number[][] = [];
  for (let i = 0; i < n; i++) {
    matrix[i] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) matrix[i][j] = 1.0;
      else if (j < i) matrix[i][j] = matrix[j][i];
      else matrix[i][j] = calcSimilarity(nodes[i], nodes[j], weights, isMath);
    }
  }
  return matrix;
}
