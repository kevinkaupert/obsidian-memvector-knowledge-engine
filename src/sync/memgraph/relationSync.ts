import type { App } from "obsidian";
import type { MemVectorSettings } from "../../settings/types";
import { buildDeleteEdgeStatement, buildTypedEdgeStatements, type TypedEdgeInput } from "./cypherBuilder";
import { connect } from "./neo4jDriverAdapter";

/** Pushes manually-created relation edges (RelationBuilderModal) live to Memgraph, in addition to the markdown files already written to wiki/relations/. */
export async function pushRelationEdges(app: App, settings: MemVectorSettings, edges: TypedEdgeInput[]): Promise<void> {
  if (edges.length === 0) return;

  const statements = buildTypedEdgeStatements(edges);
  const connection = connect(app, settings);
  try {
    await connection.runStatements(statements);
  } finally {
    await connection.close();
  }
}

/** Mirrors the edge editor's delete action on the Memgraph server - removes just that one relationship, keeps both nodes. */
export async function deleteRelationEdge(app: App, settings: MemVectorSettings, srcId: string, tgtId: string, relType: string): Promise<void> {
  const connection = connect(app, settings);
  try {
    await connection.runStatements([buildDeleteEdgeStatement(srcId, tgtId, relType)]);
  } finally {
    await connection.close();
  }
}
