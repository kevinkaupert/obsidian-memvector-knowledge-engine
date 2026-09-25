import type { EnrichedNote } from "./contextEnrichment";

export interface PreviewEntry {
  title: string;
  /** Compact source badge: "v" (vector), "g" (graph), "v+g" (both). */
  source: string;
  /** Compact reason: similarity as "0.83" and/or hop distance as "1 Hop" / "2 Hops". */
  reason: string;
}

/**
 * Purpose: Shapes enrichment results into compact preview rows (title, v/g badge, score, hops) for the toolbar's context preview (Issue #103).
 */
export function buildPreviewEntries(notes: EnrichedNote[]): PreviewEntry[] {
  return notes.map((n) => {
    const source = n.sources.map((s) => (s === "vector" ? "v" : "g")).join("+");
    const parts: string[] = [];
    if (n.similarity !== undefined) parts.push(n.similarity.toFixed(2));
    if (n.hops !== undefined) parts.push(`${n.hops} ${n.hops === 1 ? "Hop" : "Hops"}`);
    return {
      title: n.title,
      source,
      reason: parts.join("  "),
    };
  });
}
