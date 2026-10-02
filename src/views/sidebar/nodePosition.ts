import type { App } from "obsidian";
import { MATH_VECTOR_SCATTER_VIEW_TYPE } from "../../constants";
import { stripFrontmatter } from "../../noteContent";
import { hashString } from "../../hash";
import type { NoteFileLike, RadarNoteType } from "./activeNoteScoring";

import type { NodePositionProvider } from "../vectorScatter/VectorScatterView";
import { getStoredNodePositions } from "../../sync/sqlite/nodePositions";

export interface Position2D {
  x: number;
  y: number;
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

/**
 * Looks up a note's position in the live 2D vector-scatter view if it's
 * open, then reads persisted SQLite coordinates. Only notes without either
 * position use the deterministic content/type approximation.
 */
export async function getNode2DPosition(app: App, file: NoteFileLike, content: string): Promise<Position2D> {
  return (await getNode2DPositions(app, [{ file, content }])).get(file.path)!;
}

/** Read missing positions once per radar render, using live coordinates before SQLite. */
export async function getNode2DPositions(app: App, notes: { file: NoteFileLike; content: string }[]): Promise<Map<string, Position2D>> {
  const positions = new Map<string, Position2D>();
  const leaves = app.workspace.getLeavesOfType(MATH_VECTOR_SCATTER_VIEW_TYPE);
  for (const { file } of notes) {
    for (const leaf of leaves) {
      const view = leaf.view as unknown as Partial<NodePositionProvider>;
      const pos = view?.getNodePosition?.(file.path);
      if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
        positions.set(file.path, pos);
        break;
      }
    }
  }
  const missing = notes.filter(({ file }) => !positions.has(file.path));
  if (missing.length > 0) {
    try {
      const stored = await getStoredNodePositions(app, missing.map(({ file }) => file.path));
      for (const [path, pos] of stored) positions.set(path, pos);
    } catch (err) {
      console.warn("MemVector: radar positions unavailable from SQLite", err);
    }
  }
  for (const { file, content } of missing) {
    if (!positions.has(file.path)) positions.set(file.path, pseudoPosition(file, content));
  }
  return positions;
}

function pseudoPosition(file: NoteFileLike, content: string): Position2D {
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
