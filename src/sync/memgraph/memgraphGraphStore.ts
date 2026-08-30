import type { App } from "obsidian";
import type { MemVectorSettings } from "../../settings/types";
import type { GraphEdge, GraphNeighbor, GraphNode, GraphStore, TypedEdgeInput } from "../graphStore";
import { testMemgraphConnection } from "./connectionTest";
import { buildDeleteEdgeStatement, buildGraphStatements, buildTypedEdgeStatements } from "./cypherBuilder";
import { fetchGraphNeighbors } from "./graphNeighbors";
import { connect } from "./neo4jDriverAdapter";

/** GraphStore backed by a real Memgraph server over Bolt - thin wrapper around the existing driver adapter/cypher builder/neighbor-query modules, unchanged internally. */
export class MemgraphGraphStore implements GraphStore {
  constructor(
    private readonly app: App,
    private readonly settings: MemVectorSettings
  ) {}

  testConnection(): Promise<void> {
    return testMemgraphConnection(this.app, this.settings);
  }

  async syncVaultGraph(nodes: GraphNode[], edges: GraphEdge[]): Promise<{ nodeCount: number; edgeCount: number }> {
    const connection = connect(this.app, this.settings);
    try {
      await connection.runStatements(buildGraphStatements(nodes, edges));
    } finally {
      await connection.close();
    }
    return { nodeCount: nodes.length, edgeCount: edges.length };
  }

  async upsertTypedEdges(edges: TypedEdgeInput[]): Promise<void> {
    if (edges.length === 0) return;
    const connection = connect(this.app, this.settings);
    try {
      await connection.runStatements(buildTypedEdgeStatements(edges));
    } finally {
      await connection.close();
    }
  }

  async deleteEdge(srcId: string, tgtId: string, relType: string): Promise<void> {
    const connection = connect(this.app, this.settings);
    try {
      await connection.runStatements([buildDeleteEdgeStatement(srcId, tgtId, relType)]);
    } finally {
      await connection.close();
    }
  }

  fetchNeighbors(nodeIds: string[], hops: number, limit: number): Promise<GraphNeighbor[]> {
    return fetchGraphNeighbors(this.app, this.settings, nodeIds, hops, limit);
  }
}
