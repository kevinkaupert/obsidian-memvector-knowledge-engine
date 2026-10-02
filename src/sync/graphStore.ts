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

export interface SyncVaultGraphOptions {
  /** If false, existing edges in storage are not deleted (e.g. when upstream relation loading failed). Defaults to true. */
  reconcileEdges?: boolean;
  /** If false, existing notes in storage are not deleted. Defaults to true. */
  reconcileNotes?: boolean;
}

/**
 * Whatever the plugin needs from the relationship graph (local SQLite store).
 */
export interface GraphStore {
  testConnection(): Promise<void>;
  /** Full-vault re-index - notes plus typed relation edges, and WikiLink edges only when the caller opts in (includeWikiLinksAsRelations). */
  syncVaultGraph(
    nodes: GraphNode[],
    edges: GraphEdge[],
    options?: SyncVaultGraphOptions
  ): Promise<{ nodeCount: number; edgeCount: number }>;
  /** RelationBuilderModal save - one or more manually-typed relations. */
  upsertTypedEdges(edges: TypedEdgeInput[]): Promise<void>;
  /** Edge editor's delete action - removes just that one relationship, leaves both nodes. */
  deleteEdge(srcId: string, tgtId: string, relType: string): Promise<void>;
  /** GraphRAG enrichment - notes within `hops` graph-steps of the given IDs, with optional per-hop quota (Issue #103). */
  fetchNeighbors(nodeIds: string[], hops: number, limit: number, perHopLimit?: number): Promise<GraphNeighbor[]>;
  /** Checks whether the graph index has been synchronized with vault notes/edges. */
  isIndexed?(): Promise<boolean>;
}

