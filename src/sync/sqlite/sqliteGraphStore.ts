import type { App } from "obsidian";
import type { Database, QueryExecResult } from "sql.js";
import type { GraphEdge, GraphNeighbor, GraphNode, GraphStore, TypedEdgeInput } from "../graphStore";
import { getLocalDb, persistLocalDb } from "./sqliteDb";
import { buildNeighborQuery } from "./sqliteGraphQueries";

function execToRows(result: QueryExecResult[]): Record<string, string | number | null>[] {
  if (result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row) => Object.fromEntries(columns.map((col, i) => [col, row[i]])) as Record<string, string | number | null>);
}

function upsertNote(db: Database, node: GraphNode): void {
  db.run("INSERT INTO notes (id, title, path) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, path = excluded.path", [
    node.id,
    node.title,
    node.path,
  ]);
}

/** GraphStore backed by the plugin's local SQLite file (sqliteDb.ts) - no external server, one file under the plugin folder. */
export class SqliteGraphStore implements GraphStore {
  constructor(private readonly app: App) {}

  async testConnection(): Promise<void> {
    await getLocalDb(this.app);
  }

  async syncVaultGraph(nodes: GraphNode[], edges: GraphEdge[]): Promise<{ nodeCount: number; edgeCount: number }> {
    const db = await getLocalDb(this.app);
    nodes.forEach((n) => upsertNote(db, n));
    edges.forEach((e) => {
      db.run("INSERT INTO edges (src, tgt, type, description, bidirectional, original_term, updated_at) VALUES (?, ?, ?, '', 0, NULL, ?) ON CONFLICT(src, tgt, type) DO NOTHING", [
        e.src,
        e.tgt,
        e.type,
        new Date().toISOString(),
      ]);
    });
    await persistLocalDb(this.app, db);
    return { nodeCount: nodes.length, edgeCount: edges.length };
  }

  async upsertTypedEdges(edges: TypedEdgeInput[]): Promise<void> {
    if (edges.length === 0) return;
    const db = await getLocalDb(this.app);
    const seenNodeIds = new Set<string>();

    edges.forEach((e) => {
      [e.src, e.tgt].forEach((node) => {
        if (seenNodeIds.has(node.id)) return;
        seenNodeIds.add(node.id);
        upsertNote(db, node);
      });

      db.run(
        `INSERT INTO edges (src, tgt, type, description, bidirectional, original_term, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(src, tgt, type) DO UPDATE SET description = excluded.description, bidirectional = excluded.bidirectional, original_term = excluded.original_term, updated_at = excluded.updated_at`,
        [e.src.id, e.tgt.id, e.relType, e.description || "", e.bidirectional ? 1 : 0, e.originalTerm || e.relType, new Date().toISOString()]
      );
    });

    await persistLocalDb(this.app, db);
  }

  async deleteEdge(srcId: string, tgtId: string, relType: string): Promise<void> {
    const db = await getLocalDb(this.app);
    db.run("DELETE FROM edges WHERE src = ? AND tgt = ? AND type = ?", [srcId, tgtId, relType]);
    await persistLocalDb(this.app, db);
  }

  async fetchNeighbors(nodeIds: string[], hops: number, limit: number): Promise<GraphNeighbor[]> {
    if (nodeIds.length === 0) return [];
    const db = await getLocalDb(this.app);
    const { sql, params } = buildNeighborQuery(nodeIds, Math.max(1, Math.trunc(hops)), Math.max(1, Math.trunc(limit)));
    return execToRows(db.exec(sql, params)).map((r) => ({ id: String(r.id), title: String(r.title), path: String(r.path) }));
  }
}
