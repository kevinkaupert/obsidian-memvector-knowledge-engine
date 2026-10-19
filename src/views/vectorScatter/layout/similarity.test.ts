/**
 * Purpose: Rescale bounds of the semantic signal (#224). The hybrid similarity and its tests were replaced by the signal
 * model (signals.test.ts, Plan 0005).
 */
import { describe, expect, it } from "vitest";
import * as similarityModule from "./similarity";

describe("computeRescaleBounds", () => {
  it("computes bounds only from embedded pairs to prevent vector-less notes from distorting the spread (#224)", () => {
    // 60 embedded pairs with similarities between 0.35 and 0.70
    // plus 1 vector-less note with similarity 0.0 to all other notes
    const n = 12;
    const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      matrix[i][i] = 1.0;
      for (let j = i + 1; j < n; j++) {
        // Node n - 1 has no vector and no links -> similarity 0.0
        if (i === n - 1 || j === n - 1) {
          matrix[i][j] = 0.0;
          matrix[j][i] = 0.0;
        } else {
          // Embedded pairs have similarity between 0.35 and 0.70
          const val = 0.35 + 0.35 * ((i * n + j) / (n * n));
          matrix[i][j] = val;
          matrix[j][i] = val;
        }
      }
    }

    const embeddedIndices = Array.from({ length: n - 1 }, (_, i) => i);
    const boundsAll = similarityModule.computeRescaleBounds(matrix);
    const boundsEmbedded = similarityModule.computeRescaleBounds(matrix, embeddedIndices);

    expect(boundsAll?.low).toBe(0.0); // Polluted by vector-less note
    expect(boundsEmbedded?.low).toBeGreaterThanOrEqual(0.35); // Protected from distortion
    expect(boundsEmbedded?.high).toBeCloseTo(boundsAll?.high ?? 0, 2);
  });

  it("protects lower bound when exactly one note is embedded and the rest are vector-less", () => {
    const n = 10;
    const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      matrix[i][i] = 1.0;
      for (let j = i + 1; j < n; j++) {
        if (i === 0 || j === 0) {
          matrix[i][j] = 0.0;
          matrix[j][i] = 0.0;
        } else {
          const val = 0.25 + 0.15 * ((i * n + j) / (n * n));
          matrix[i][j] = val;
          matrix[j][i] = val;
        }
      }
    }

    const embeddedIndices = [0];
    const boundsAll = similarityModule.computeRescaleBounds(matrix);
    const boundsProtected = similarityModule.computeRescaleBounds(matrix, embeddedIndices);

    expect(boundsAll?.low).toBe(0.0);
    expect(boundsProtected?.low).toBeGreaterThanOrEqual(0.25);
  });
});
