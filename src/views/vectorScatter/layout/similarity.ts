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

/** Tokenized and prepared representation of a node's text, formulas, and folder for fast pairwise similarity. */
export interface PreparedNodeTokens {
  words: Set<string>;
  formulas: Set<string>;
  folder: string;
}

/**
 * Purpose: Precomputes word tokens, LaTeX formula sets, and directory path once per node to prevent O(N^2) re-tokenization.
 */
export function prepareNodeTokens(node: ScatterNode): PreparedNodeTokens {
  const words = new Set((node.content || "").toLowerCase().match(/\b[a-z0-9_]{3,}\b/g) || []);
  const formulas = new Set(node.latexFormulas || []);
  const lastSlash = node.path.lastIndexOf("/");
  const folder = lastSlash > 0 ? node.path.slice(0, lastSlash) : "";
  return { words, formulas, folder };
}

/**
 * Purpose: Hybrid similarity S(a,b) blending embedding cosine similarity, word/formula overlap, wikilinks, and folder co-location.
 */
export function calcSimilarity(
  a: ScatterNode,
  b: ScatterNode,
  weights: SimilarityWeights,
  isMath: boolean,
  tokensA?: PreparedNodeTokens,
  tokensB?: PreparedNodeTokens
): number {
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

  const wordsA = tokensA ? tokensA.words : new Set((a.content || "").toLowerCase().match(/\b[a-z0-9_]{3,}\b/g) || []);
  const wordsB = tokensB ? tokensB.words : new Set((b.content || "").toLowerCase().match(/\b[a-z0-9_]{3,}\b/g) || []);
  let wordIntersect = 0;
  wordsA.forEach((w) => {
    if (wordsB.has(w)) wordIntersect++;
  });
  const wordUnion = Math.max(1, wordsA.size + wordsB.size - wordIntersect);
  const wordSim = wordIntersect / wordUnion;

  const formsA = tokensA ? tokensA.formulas : new Set(a.latexFormulas || []);
  const formsB = tokensB ? tokensB.formulas : new Set(b.latexFormulas || []);
  let formIntersect = 0;
  formsA.forEach((f) => {
    if (formsB.has(f)) formIntersect++;
  });
  const formSim = formsA.size + formsB.size > 0 ? formIntersect / Math.max(1, Math.min(formsA.size, formsB.size)) : 0;

  // WikiLinks target basenames, not the canonical (path-based) id - match on basenameKey.
  const isWikiLinked = (a.links && a.links.includes(b.basenameKey)) || (b.links && b.links.includes(a.basenameKey));
  const linkSim = isWikiLinked ? 0.75 : 0;

  const folderA = tokensA ? tokensA.folder : (a.path.lastIndexOf("/") > 0 ? a.path.slice(0, a.path.lastIndexOf("/")) : "");
  const folderB = tokensB ? tokensB.folder : (b.path.lastIndexOf("/") > 0 ? b.path.slice(0, b.path.lastIndexOf("/")) : "");
  const folderSim = folderA && folderA === folderB ? 0.4 : 0;

  const semSim = isMath ? formSim : wordSim;

  if (a.embedding && b.embedding) {
    return Math.min(1.0, vecSim * weights.vector + linkSim * weights.wikiLinks + folderSim * weights.folder + semSim * weights.semantics);
  }
  const adjustedSemWeight = weights.semantics + weights.vector * 0.5;
  const adjustedLinkWeight = weights.wikiLinks + weights.vector * 0.5;
  return Math.min(1.0, semSim * adjustedSemWeight + linkSim * adjustedLinkWeight + folderSim * weights.folder);
}

/**
 * Purpose: Full pairwise similarity matrix, symmetric, diagonal = 1, using precomputed O(N) token sets.
 */
export function buildSimilarityMatrix(nodes: ScatterNode[], weights: SimilarityWeights, isMath: boolean): number[][] {
  const n = nodes.length;
  const tokenCache: PreparedNodeTokens[] = nodes.map(prepareNodeTokens);

  const matrix: number[][] = [];
  for (let i = 0; i < n; i++) {
    matrix[i] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) matrix[i][j] = 1.0;
      else if (j < i) matrix[i][j] = matrix[j][i];
      else matrix[i][j] = calcSimilarity(nodes[i], nodes[j], weights, isMath, tokenCache[i], tokenCache[j]);
    }
  }
  return matrix;
}

/**
 * Purpose: Linearly stretches off-diagonal similarities to [0, 1] relative to the vault's distribution to overcome embedding cosine anisotropy.
 */
export function rescaleSimilarityMatrix(matrix: number[][]): number[][] {
  const n = matrix.length;
  if (n <= 1) return matrix;

  const vals: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      vals.push(matrix[i][j]);
    }
  }

  if (vals.length === 0) return matrix;

  vals.sort((a, b) => a - b);
  // For larger vaults (>50 pairs), use 1st/99th percentiles to guard against single isolated outliers collapsing the spread.
  const pLow = vals.length > 50 ? vals[Math.floor(vals.length * 0.01)] : vals[0];
  const pHigh = vals.length > 50 ? vals[Math.floor(vals.length * 0.99)] : vals[vals.length - 1];

  const spread = pHigh - pLow;
  if (spread < 1e-6) return matrix;

  const rescaled: number[][] = [];
  for (let i = 0; i < n; i++) {
    rescaled[i] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) {
        rescaled[i][j] = 1.0;
      } else if (j < i) {
        rescaled[i][j] = rescaled[j][i];
      } else {
        const val = matrix[i][j];
        const normalized = (val - pLow) / spread;
        rescaled[i][j] = Math.max(0, Math.min(1.0, normalized));
      }
    }
  }
  return rescaled;
}

