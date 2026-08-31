import type { ScatterNode } from "./types";

/** Exact title/id matches first, then every remaining substring match (in scan order) - so repeatedly pressing Enter on the same query can cycle through all of them, e.g. "gauss" -> Gauß-Summenformel, then Gaußsche Glockenkurve, ... */
export function findNodesByQuery(nodes: ScatterNode[], query: string): ScatterNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const exact = nodes.filter((n) => n.title.toLowerCase() === q || n.id.toLowerCase() === q);
  const rest = nodes.filter((n) => !exact.includes(n) && (n.title.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)));
  return [...exact, ...rest];
}
