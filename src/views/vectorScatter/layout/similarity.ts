/**
 * Purpose: Vault-relative rescale bounds of the semantic signal (Plan 0005 section 2.2). The hybrid similarity that
 * mixed embeddings, WikiLinks, folders and words was replaced by the signal model in signals.ts (ADR-0008).
 */

/** Lower and upper similarity mapped to 0 and 1 by the semantic signal (signals.ts). */
export interface RescaleBounds {
  low: number;
  high: number;
}

/**
 * Purpose: Derives the rescale bounds from the vault's off-diagonal similarity distribution, or null when there is
 * nothing to stretch (fewer than two nodes).
 * Architecture: If `embeddedIndices` is provided with at least two embedded nodes, bounds are computed from
 * pairwise similarities between embedded nodes to prevent vector-less notes from collapsing the lower bound to 0 (Issue #224).
 */
export function computeRescaleBounds(matrix: number[][], embeddedIndices?: readonly number[]): RescaleBounds | null {
  const n = matrix.length;
  if (n <= 1) return null;

  const vals: number[] = [];
  if (embeddedIndices && embeddedIndices.length >= 2) {
    for (let i = 0; i < embeddedIndices.length; i++) {
      const idxI = embeddedIndices[i];
      for (let j = i + 1; j < embeddedIndices.length; j++) {
        const idxJ = embeddedIndices[j];
        if (idxI < n && idxJ < n) {
          vals.push(matrix[idxI][idxJ]);
        }
      }
    }
  } else if (embeddedIndices && embeddedIndices.length === 1) {
    // Exactly one note is embedded: no embedded-embedded pairs exist.
    // Exclude the single embedded note's artificial zero-similarity pairs so they don't collapse the lower bound.
    const singleIdx = embeddedIndices[0];
    for (let i = 0; i < n; i++) {
      if (i === singleIdx) continue;
      for (let j = i + 1; j < n; j++) {
        if (j === singleIdx) continue;
        vals.push(matrix[i][j]);
      }
    }
  } else {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        vals.push(matrix[i][j]);
      }
    }
  }

  if (vals.length === 0) return null;

  vals.sort((a, b) => a - b);
  // For larger vaults (>50 pairs), use 1st/99th percentiles to guard against single isolated outliers collapsing the spread.
  const low = vals.length > 50 ? vals[Math.floor(vals.length * 0.01)] : vals[0];
  const high = vals.length > 50 ? vals[Math.floor(vals.length * 0.99)] : vals[vals.length - 1];
  return { low, high };
}

