import type { ScatterNode } from "./types";

/** Exact title/id match wins; otherwise the first substring match, so "gauss" still finds "Gauß-Summenformel". */
export function findNodeByQuery(nodes: ScatterNode[], query: string): ScatterNode | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const exact = nodes.find((n) => n.title.toLowerCase() === q || n.id.toLowerCase() === q);
  if (exact) return exact;

  return nodes.find((n) => n.title.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)) || null;
}
