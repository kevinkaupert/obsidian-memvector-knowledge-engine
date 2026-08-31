export interface RelationNode {
  id: string;
  title: string;
  path: string;
  type: string;
}

export interface RelationEdgeDraft {
  src: RelationNode;
  tgt: RelationNode;
}

export type EdgeTopology = "FOCAL_TO_REST" | "REST_TO_FOCAL" | "CHAIN";

/** Turns the selected nodes + chosen topology into a src->tgt edge list. */
export function generateEdges(nodes: RelationNode[], topology: EdgeTopology, focalIndex: number): RelationEdgeDraft[] {
  const edges: RelationEdgeDraft[] = [];
  const focal = nodes[focalIndex] || nodes[0];

  if (topology === "CHAIN") {
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({ src: nodes[i], tgt: nodes[i + 1] });
    }
  } else if (topology === "REST_TO_FOCAL") {
    nodes.forEach((n, idx) => {
      if (idx !== focalIndex) edges.push({ src: n, tgt: focal });
    });
  } else {
    nodes.forEach((n, idx) => {
      if (idx !== focalIndex) edges.push({ src: focal, tgt: n });
    });
  }

  return edges;
}
