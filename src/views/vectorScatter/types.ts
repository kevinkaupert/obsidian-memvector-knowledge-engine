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

/**
 * Purpose: Determines whether a scatter node represents a typed relation file.
 */
export function isRelationNode(node: ScatterNode): boolean {
  return (
    node.type === "relation" ||
    node.path.includes("wiki/relations/") ||
    node.path.includes("/relations/") ||
    node.path.startsWith("wiki/relations")
  );
}

/**
 * Purpose: Filters visible scatter nodes based on relation notes display toggle.
 */
export function filterVisibleNodes(nodes: ScatterNode[], showRelationNotes: boolean): ScatterNode[] {
  if (showRelationNotes) return nodes;
  return nodes.filter((n) => !isRelationNode(n));
}

