import type { App } from "obsidian";
import { MATH_VECTOR_SCATTER_VIEW_TYPE } from "../../constants";
import { stripFrontmatter } from "../../noteContent";
import type { NoteFileLike, RadarNoteType } from "./activeNoteScoring";

export interface Position2D {
  x: number;
  y: number;
}

interface ScatterNodeLike {
  id: string;
  x: number;
  y: number;
}

interface ScatterViewLike {
  nodes?: ScatterNodeLike[];
}

const TYPE_OFFSETS: Partial<Record<RadarNoteType, Position2D>> = {
  definition: { x: -250, y: -150 },
  theorem: { x: 200, y: -150 },
  concept: { x: 0, y: 150 },
  relation: { x: -200, y: 150 },
  synthesis: { x: 250, y: 150 },
  course: { x: 0, y: -250 },
  question: { x: -300, y: 0 },
  source: { x: 300, y: 0 },
};

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

/**
 * Looks up a note's position in the live 2D vector-scatter view if it's
 * open (exact positions win); otherwise falls back to a deterministic
 * pseudo-position derived from a content hash, offset by a rough type
 * cluster so notes of the same kind land near each other even before any
 * real embedding-based layout has run.
 */
export function getNode2DPosition(app: App, file: NoteFileLike, content: string): Position2D {
  const scatterLeaf = app.workspace.getLeavesOfType(MATH_VECTOR_SCATTER_VIEW_TYPE)[0];
  const view = scatterLeaf?.view as unknown as ScatterViewLike | undefined;
  if (view?.nodes) {
    const match = view.nodes.find((n) => n.id.toLowerCase() === file.basename.toLowerCase());
    if (match) return { x: match.x, y: match.y };
  }

  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  // Matches the original: always defaults to "concept" regardless of the
  // note's already-classified radar type, only frontmatter can override it.
  let type: RadarNoteType = "concept";
  if (frontmatterMatch) {
    const typeMatch = frontmatterMatch[1].match(/^type:\s*(.+)$/m);
    if (typeMatch) type = typeMatch[1].trim().toLowerCase() as RadarNoteType;
  }

  const latexMatches = [...content.matchAll(/\$\$?([\s\S]+?)\$\$?/g)].map((m) => m[1].trim());
  // Bugfix: was hashing raw content including frontmatter - a long
  // `sources:`/`tags:` block could consume the whole 500-char window.
  const hash = hashString(file.basename + stripFrontmatter(content).slice(0, 500) + latexMatches.join(""));
  const baseOffset = TYPE_OFFSETS[type] || { x: 0, y: 0 };

  return {
    x: baseOffset.x + ((Math.abs(hash) % 300) - 150),
    y: baseOffset.y + ((Math.abs(hash >> 3) % 300) - 150),
  };
}
