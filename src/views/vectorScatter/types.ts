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
  id: string;
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
