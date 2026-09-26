import type { EnrichedNote } from "./contextEnrichment";

/** Directly selected note driving the synthesis - the seed core of the context preview (Issue #117). */
export interface PreviewSeed {
  id: string;
  title: string;
}

export interface PreviewEntry {
  id: string;
  title: string;
  /** "seed" for directly selected notes, "traversed" for enriched neighbors. */
  kind: "seed" | "traversed";
  /** Compact source badge: "seed", "v" (vector), "g" (graph), "v+g" (both). */
  source: string;
  /** Compact reason: similarity as "0.83" and/or hop distance as "1 Hop" / "2 Hops". */
  reason: string;
}

export interface PreviewSections {
  /** Directly selected seed notes - pinned at the top of the preview. */
  seeds: PreviewEntry[];
  /** Enriched neighbor notes from vector search and/or graph traversal. */
  traversed: PreviewEntry[];
  /** seeds.length + traversed.length - the full context note count. */
  total: number;
}

/**
 * Purpose: Shapes selected seed notes and enrichment results into grouped preview rows for the toolbar's context preview (Issue #117).
 * Architecture: Seeds are rendered pinned above traversed notes with a distinct badge and section headers; the total count covers both groups.
 */
export function buildPreviewEntries(notes: EnrichedNote[], selected: PreviewSeed[] = []): PreviewSections {
  const seeds: PreviewEntry[] = selected.map((s) => ({
    id: s.id,
    title: s.title,
    kind: "seed",
    source: "seed",
    reason: "",
  }));

  const traversed: PreviewEntry[] = notes.map((n) => {
    const source = n.sources.map((s) => (s === "vector" ? "v" : "g")).join("+");
    const parts: string[] = [];
    if (n.similarity !== undefined) parts.push(n.similarity.toFixed(2));
    if (n.hops !== undefined) parts.push(`${n.hops} ${n.hops === 1 ? "Hop" : "Hops"}`);
    return {
      id: n.id,
      title: n.title,
      kind: "traversed",
      source,
      reason: parts.join("  "),
    };
  });

  return { seeds, traversed, total: seeds.length + traversed.length };
}

/**
 * Purpose: Removes manually dismissed notes from the preview sections and recomputes the total (Issue #116).
 * Architecture: Pure set filtering shared by the toolbar preview and its unit tests - seeds cannot be
 * dismissed (users deselect them instead), so only the traversed group is filtered.
 */
export function withoutDismissed(sections: PreviewSections, dismissedIds: ReadonlySet<string>): PreviewSections {
  const traversed = sections.traversed.filter((entry) => !dismissedIds.has(entry.id));
  return { seeds: sections.seeds, traversed, total: sections.seeds.length + traversed.length };
}
