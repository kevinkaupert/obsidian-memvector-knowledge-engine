import type { GraphEdge, GraphNode, TypedEdgeInput } from "./memgraph/cypherBuilder";
import type { GraphNeighbor } from "./memgraph/graphNeighbors";

export type { GraphEdge, GraphNode, GraphNeighbor, TypedEdgeInput };

/**
 * Whatever the plugin needs from the relationship graph, independent of
 * where it actually lives (Memgraph over Bolt, or a local SQLite file).
 * memgraphGraphStore.ts and sqlite/sqliteGraphStore.ts both implement this;
 * storeFactory.ts picks which one based on settings.graphBackend.
 */
export interface GraphStore {
  testConnection(): Promise<void>;
  /** Full-vault re-index from extractVaultGraph() (memgraphSync.ts) - notes + WikiLink edges. */
  syncVaultGraph(nodes: GraphNode[], edges: GraphEdge[]): Promise<{ nodeCount: number; edgeCount: number }>;
  /** RelationBuilderModal save - one or more manually-typed relations. */
  upsertTypedEdges(edges: TypedEdgeInput[]): Promise<void>;
  /** Edge editor's delete action - removes just that one relationship, leaves both nodes. */
  deleteEdge(srcId: string, tgtId: string, relType: string): Promise<void>;
  /** GraphRAG enrichment - notes within `hops` graph-steps of the given IDs. */
  fetchNeighbors(nodeIds: string[], hops: number, limit: number): Promise<GraphNeighbor[]>;
}
