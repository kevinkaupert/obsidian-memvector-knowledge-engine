import type { App } from "obsidian";
import type { Database, QueryExecResult } from "sql.js";
import type { GraphEdge, GraphNeighbor, GraphNode, GraphStore, SyncVaultGraphOptions, TypedEdgeInput } from "../graphStore";
import { getLocalDb, persistLocalDb, storedKeyAt } from "./sqliteDb";
import { buildNeighborQuery } from "./sqliteGraphQueries";
import { noteKey } from "../../noteKey";

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

  /**
   * Purpose: Full-vault re-index: upserts node and edge sets, optionally reconciling deletions.
   * Architecture: Reconciles storage to match vault state. When options.reconcileEdges is false,
   * edge deletion is skipped to protect existing stored relations against upstream scan errors (Issue #183).
   */
  async syncVaultGraph(
    nodes: GraphNode[],
    edges: GraphEdge[],
    options?: SyncVaultGraphOptions
  ): Promise<{ nodeCount: number; edgeCount: number }> {
    const db = await getLocalDb(this.app);
    nodes.forEach((n) => upsertNote(db, n));
    const shouldReconcileEdges = options?.reconcileEdges ?? true;
    edges.forEach((e) => {
      if (shouldReconcileEdges) {
        db.run(
          `INSERT INTO edges (src, tgt, type, description, bidirectional, original_term, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(src, tgt, type) DO UPDATE SET
             description = excluded.description,
             bidirectional = excluded.bidirectional,
             original_term = excluded.original_term,
             updated_at = excluded.updated_at`,
          [
            e.src,
            e.tgt,
            e.type,
            e.description ?? "",
            e.bidirectional ? 1 : 0,
            e.originalTerm ?? null,
            new Date().toISOString(),
          ]
        );
      } else {
        db.run(
          `INSERT INTO edges (src, tgt, type, description, bidirectional, original_term, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(src, tgt, type) DO UPDATE SET
             description = CASE WHEN excluded.description != '' THEN excluded.description ELSE edges.description END,
             bidirectional = CASE WHEN excluded.bidirectional = 1 THEN 1 ELSE edges.bidirectional END,
             original_term = COALESCE(excluded.original_term, edges.original_term)`,
          [
            e.src,
            e.tgt,
            e.type,
            e.description ?? "",
            e.bidirectional ? 1 : 0,
            e.originalTerm ?? null,
            new Date().toISOString(),
          ]
        );
      }
    });

    const currentNodeIds = new Set(nodes.map((n) => n.id));
    const currentEdgeKeys = new Set(edges.map((e) => `${e.src}|${e.tgt}|${e.type}`));
    if (shouldReconcileEdges) {
      const existingEdges = execToRows(db.exec("SELECT src, tgt, type FROM edges"));
      for (const row of existingEdges) {
        const src = String(row.src);
        const tgt = String(row.tgt);
        const type = String(row.type);
        if (!currentEdgeKeys.has(`${src}|${tgt}|${type}`)) {
          db.run("DELETE FROM edges WHERE src = ? AND tgt = ? AND type = ?", [src, tgt, type]);
        }
      }
    }

    const shouldReconcileNotes = options?.reconcileNotes ?? true;
    if (shouldReconcileNotes) {
      const existingNotes = execToRows(db.exec("SELECT id FROM notes"));
      for (const row of existingNotes) {
        const id = String(row.id);
        if (!currentNodeIds.has(id)) {
          db.run("DELETE FROM notes WHERE id = ?", [id]);
        }
      }
    }

    await persistLocalDb(this.app, db);
    return { nodeCount: nodes.length, edgeCount: edges.length };
  }

  async upsertTypedEdges(edges: TypedEdgeInput[]): Promise<void> {
    if (edges.length === 0) return;
    const db = await getLocalDb(this.app);
    const seenNodeIds = new Set<string>();

    const upsertRow = (srcId: string, tgtId: string, relType: string, description: string, bidirectional: number, originalTerm: string) => {
      db.run(
        `INSERT INTO edges (src, tgt, type, description, bidirectional, original_term, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(src, tgt, type) DO UPDATE SET description = excluded.description, bidirectional = excluded.bidirectional, original_term = excluded.original_term, updated_at = excluded.updated_at`,
        [srcId, tgtId, relType, description, bidirectional, originalTerm, new Date().toISOString()]
      );
    };

    edges.forEach((e) => {
      [e.src, e.tgt].forEach((node) => {
        if (seenNodeIds.has(node.id)) return;
        seenNodeIds.add(node.id);
        upsertNote(db, node);
      });

      const originalTerm = e.originalTerm || e.relType;
      const description = e.description || "";
      upsertRow(e.src.id, e.tgt.id, e.relType, description, e.bidirectional ? 1 : 0, originalTerm);
      if (e.bidirectional) {
        // Match syncVaultGraph: bidirectional relations are stored as two rows
        // so the recursive CTE finds both traversal directions (Issue #120).
        upsertRow(e.tgt.id, e.src.id, e.relType, description, 1, originalTerm);
      }
    });

    await persistLocalDb(this.app, db);
  }

  async deleteEdge(srcId: string, tgtId: string, relType: string): Promise<void> {
    const db = await getLocalDb(this.app);
    db.run("DELETE FROM edges WHERE src = ? AND tgt = ? AND type = ?", [srcId, tgtId, relType]);
    await persistLocalDb(this.app, db);
  }

  async fetchNeighbors(nodeIds: string[], hops: number, limit: number, perHopLimit = 0): Promise<GraphNeighbor[]> {
    if (nodeIds.length === 0) return [];
    const db = await getLocalDb(this.app);
    const { sql, params } = buildNeighborQuery(
      nodeIds,
      Math.max(1, Math.trunc(hops)),
      limit > 0 ? Math.trunc(limit) : 0,
      perHopLimit > 0 ? Math.trunc(perHopLimit) : 0
    );
    return execToRows(db.exec(sql, params)).map((r) => ({
      id: String(r.id),
      title: String(r.title),
      path: String(r.path),
      hops: Number(r.hops) || 1,
    }));
  }

  async isIndexed(): Promise<boolean> {
    const db = await getLocalDb(this.app);
    const rows = execToRows(db.exec("SELECT COUNT(*) as cnt FROM notes"));
    const count = Number(rows[0]?.cnt) || 0;
    return count > 0;
  }

  /**
   * Purpose: Moves an existing note row and updates connected edges on rename (Issue #250).
   */
  async moveNote(oldPath: string, newPath: string, newTitle: string): Promise<boolean> {
    const db = await getLocalDb(this.app);
    const oldId = storedKeyAt(db, "notes", oldPath);
    const newId = noteKey(this.app, newPath);

    const check = db.exec("SELECT id FROM notes WHERE id = ? OR path = ?", [oldId, oldPath]);
    if (check.length === 0 || check[0].values.length === 0) return false;

    db.run("DELETE FROM notes WHERE (id = ? OR path = ?) AND id != ?", [newId, newPath, oldId]);
    db.run("UPDATE notes SET id = ?, title = ?, path = ? WHERE id = ? OR path = ?", [
      newId,
      newTitle,
      newPath,
      oldId,
      oldPath,
    ]);

    if (oldId !== newId) {
      db.run(
        "DELETE FROM edges WHERE src = ? AND EXISTS (SELECT 1 FROM edges e2 WHERE e2.src = ? AND e2.tgt = edges.tgt AND e2.type = edges.type)",
        [oldId, newId]
      );
      db.run("UPDATE edges SET src = ? WHERE src = ?", [newId, oldId]);

      db.run(
        "DELETE FROM edges WHERE tgt = ? AND EXISTS (SELECT 1 FROM edges e2 WHERE e2.tgt = ? AND e2.src = edges.src AND e2.type = edges.type)",
        [oldId, newId]
      );
      db.run("UPDATE edges SET tgt = ? WHERE tgt = ?", [newId, oldId]);
    }

    await persistLocalDb(this.app, db);
    return true;
  }

  /**
   * Purpose: Deletes an existing note and its connected edges (Issue #250).
   */
  async deleteNote(pathOrId: string): Promise<boolean> {
    const db = await getLocalDb(this.app);
    const id = storedKeyAt(db, "notes", pathOrId);
    db.run("DELETE FROM edges WHERE src = ? OR tgt = ?", [id, id]);
    db.run("DELETE FROM notes WHERE id = ? OR path = ?", [id, pathOrId]);
    const modified = db.getRowsModified() > 0;
    if (modified) {
      await persistLocalDb(this.app, db);
    }
    return modified;
  }

  /**
   * Purpose: Upserts a single note into the graph (Issue #250).
   */
  async upsertNoteNode(node: GraphNode): Promise<void> {
    const db = await getLocalDb(this.app);
    upsertNote(db, node);
    await persistLocalDb(this.app, db);
  }

  /**
   * Purpose: Replaces WikiLink LINKS_TO edges originating from a source note (Issue #250).
   * Architecture: Only removes WikiLink-derived edges (where original_term is null/empty, description is empty, and bidirectional is 0),
   * preserving explicit relations with label 'LINKS_TO' created via Relation Builder or relation files.
   */
  async replaceOutgoingWikiLinks(srcId: string, targetIds: string[]): Promise<void> {
    const db = await getLocalDb(this.app);
    db.run(
      "DELETE FROM edges WHERE src = ? AND type = 'LINKS_TO' AND (original_term IS NULL OR original_term = '') AND (description IS NULL OR description = '') AND bidirectional = 0",
      [srcId]
    );
    const now = new Date().toISOString();
    for (const tgt of targetIds) {
      db.run(
        "INSERT INTO edges (src, tgt, type, description, bidirectional, original_term, updated_at) VALUES (?, ?, 'LINKS_TO', '', 0, NULL, ?) ON CONFLICT(src, tgt, type) DO NOTHING",
        [srcId, tgt, now]
      );
    }
    await persistLocalDb(this.app, db);
  }
}
