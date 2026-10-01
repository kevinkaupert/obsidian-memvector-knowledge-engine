import { isRelationNote } from "../../relationNotes";
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
  /**
   * Whether x/y are a real position (restored from storage or computed by the layout). A node can legitimately sit at
   * the origin, so (0, 0) alone does not mean "unplaced". Absent on nodes built outside the scan, where the origin
   * check is the fallback.
   */
  placed?: boolean;
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
 * Purpose: Tells whether a node already has a position on the canvas.
 * Architecture: The explicit flag wins, so a node placed at exactly (0, 0) is persisted, restored and never re-seeded
 * (Issue #190). Nodes without the flag fall back to the origin check.
 */
export function isPlaced(node: ScatterNode): boolean {
  return node.placed ?? (node.x !== 0 || node.y !== 0);
}

/** Purpose: Sets a node's position and marks it as placed. */
export function placeNode(node: ScatterNode, x: number, y: number): void {
  node.x = x;
  node.y = y;
  node.placed = true;
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
export function isRelationNode(node: ScatterNode, relationsFolder?: string): boolean {
  // node.type is the note's frontmatter type (vaultScan), so this is the shared relation-note rule.
  return isRelationNote(node.path, node.type, relationsFolder);
}

/**
 * Purpose: Filters visible scatter nodes based on relation notes display toggle.
 */
export function filterVisibleNodes(nodes: ScatterNode[], showRelationNotes: boolean, relationsFolder?: string): ScatterNode[] {
  if (showRelationNotes) return nodes;
  return nodes.filter((n) => !isRelationNode(n, relationsFolder));
}

