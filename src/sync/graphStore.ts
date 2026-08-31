export interface GraphNode {
  id: string;
  title: string;
  path: string;
}

export interface GraphEdge {
  src: string;
  tgt: string;
  type: string;
}

export interface GraphNeighbor {
  id: string;
  title: string;
  path: string;
  hops: number;
}

export interface TypedEdgeInput {
  src: { id: string; title: string; path: string };
  tgt: { id: string; title: string; path: string };
  relType: string;
  description: string;
  bidirectional?: boolean;
  originalTerm?: string;
}

/**
 * Whatever the plugin needs from the relationship graph (local SQLite store).
 */
export interface GraphStore {
  testConnection(): Promise<void>;
  /** Full-vault re-index - notes + WikiLink edges. */
  syncVaultGraph(nodes: GraphNode[], edges: GraphEdge[]): Promise<{ nodeCount: number; edgeCount: number }>;
  /** RelationBuilderModal save - one or more manually-typed relations. */
  upsertTypedEdges(edges: TypedEdgeInput[]): Promise<void>;
  /** Edge editor's delete action - removes just that one relationship, leaves both nodes. */
  deleteEdge(srcId: string, tgtId: string, relType: string): Promise<void>;
  /** GraphRAG enrichment - notes within `hops` graph-steps of the given IDs. */
  fetchNeighbors(nodeIds: string[], hops: number, limit: number): Promise<GraphNeighbor[]>;
}

