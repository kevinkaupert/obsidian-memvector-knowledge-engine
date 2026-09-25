export type ScatterNoteType =
  | "definition"
  | "theorem"
  | "concept"
  | "relation"
  | "synthesis"
  | "course"
  | "question"
  | "source";

export interface ScatterNode {
  /** Canonical, path-based, collision-free storage/retrieval identity - see noteSlug.ts::pathToId. Never write this as literal WikiLink text. */
  id: string;
  /** Lowercased file basename, for matching against raw WikiLink target text extracted from note bodies (`links` below) - WikiLinks target basenames, not the canonical `id`. */
  basenameKey: string;
  title: string;
  type: ScatterNoteType;
  path: string;
  x: number;
  y: number;
  latexFormulas: string[];
  links: string[];
  content: string;
  embedding?: number[];
  cloudId?: number;
  cloudLabel?: string;
  anchorX?: number;
  anchorY?: number;
}

export interface RelationEdge {
  srcId: string;
  tgtId: string;
  relType: string;
  desc: string;
  title: string;
  path: string;
  bidirectional: boolean;
}

/**
 * Purpose: Indexes scatter nodes by lowercase ID for O(1) graph lookups.
 */
export function buildNodeMap(nodes: ScatterNode[]): Map<string, ScatterNode> {
  const map = new Map<string, ScatterNode>();
  for (const n of nodes) {
    map.set(n.id.toLowerCase(), n);
  }
  return map;
}
