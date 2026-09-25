import type { TranslationKeys } from "../../i18n";
import type { EnrichedNote } from "./contextEnrichment";

export interface PreviewEntry {
  title: string;
  /** Prompt-style source badge, e.g. "[graph+vector]" - matches what the synthesis prompt shows. */
  source: string;
  /** Why this note is in the context: hop distance and/or cosine similarity. */
  reason: string;
}

/**
 * Purpose: Shapes enrichment results into preview rows (title, source badge, reason) for the toolbar's context preview (Issue #103).
 */
export function buildPreviewEntries(notes: EnrichedNote[], t: TranslationKeys): PreviewEntry[] {
  return notes.map((n) => {
    const parts: string[] = [];
    if (n.hops !== undefined) parts.push(`${n.hops} ${n.hops === 1 ? "Hop" : "Hops"}`);
    if (n.similarity !== undefined) parts.push(`${t.previewSimilarity} ${n.similarity.toFixed(2)}`);
    return {
      title: n.title,
      source: `[${n.sources.join("+")}]`,
      reason: parts.join(", "),
    };
  });
}
