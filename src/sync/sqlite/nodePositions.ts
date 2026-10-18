import type { App } from "obsidian";
import { getLocalDb, persistLocalDb, storedKeyAt } from "./sqliteDb";
import { listIndexableFiles } from "../../vaultFilter";
import { noteKeys, noteKey } from "../../noteKey";

export interface StoredNodePosition {
  id: string;
  path?: string;
  x: number;
  y: number;
}

/**
 * Purpose: Retrieves persisted 2D canvas coordinates for scatter nodes from SQLite to preserve user mental map.
 */
export async function getStoredNodePositions(
  app: App,
  identifiers: string[]
): Promise<Map<string, { x: number; y: number }>> {
  const result = new Map<string, { x: number; y: number }>();
  if (identifiers.length === 0) return result;

  const db = await getLocalDb(app);
  const rows = db.exec("SELECT id, path, x, y FROM node_positions");
  if (rows.length === 0 || rows[0].values.length === 0) return result;

  const wanted = new Set(identifiers);
  const { columns, values } = rows[0];
  const idxId = columns.indexOf("id");
  const idxPath = columns.indexOf("path");
  const idxX = columns.indexOf("x");
  const idxY = columns.indexOf("y");

  for (const row of values) {
    const id = String(row[idxId]);
    const path = row[idxPath] ? String(row[idxPath]) : "";
    const x = Number(row[idxX]);
    const y = Number(row[idxY]);

    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    if (wanted.has(id)) {
      result.set(id, { x, y });
    }
    if (path && wanted.has(path)) {
      result.set(path, { x, y });
    }
  }

  return result;
}

/**
 * Purpose: Persists 2D canvas coordinates of scatter nodes to SQLite for session continuity.
 */
export async function saveNodePositions(
  app: App,
  positions: StoredNodePosition[]
): Promise<void> {
  const valid = positions.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (valid.length === 0) return;

  const db = await getLocalDb(app);
  const now = Date.now();
  for (const pos of valid) {
    db.run(
      `INSERT INTO node_positions (id, path, x, y, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET path = excluded.path, x = excluded.x, y = excluded.y, updated_at = excluded.updated_at`,
      [pos.id, pos.path ?? null, pos.x, pos.y, now]
    );
  }
  await persistLocalDb(app, db);
}

/**
 * Purpose: Deletes persisted positions for nodes that no longer exist in the vault.
 */
export async function reconcileNodePositions(
  app: App,
  activeIds: string[]
): Promise<{ removed: number }> {
  const db = await getLocalDb(app);
  const current = new Set(activeIds);

  const result = db.exec("SELECT id FROM node_positions");
  if (result.length === 0 || result[0].values.length === 0) return { removed: 0 };

  const existingIds = result[0].values.map((row) => String(row[0]));
  let removed = 0;
  for (const id of existingIds) {
    if (!current.has(id)) {
      db.run("DELETE FROM node_positions WHERE id = ?", [id]);
      removed++;
    }
  }

  if (removed > 0) {
    await persistLocalDb(app, db);
  }
  return { removed };
}

/**
 * Purpose: Deletes stored 2D positions of notes that are no longer part of the indexable vault (deleted or excluded).
 * Architecture: Compares against every indexable file, never a filtered 2D view, so notes merely hidden by a view
 * filter or by relation-note visibility keep their position. Called by the full re-index paths, next to the vector
 * reconciliation. Without it a deleted note's row stays forever and a note recreated at the same path reappears at
 * its old coordinates.
 */
export async function reconcileNodePositionsWithVault(app: App, exclusions: string): Promise<{ removed: number }> {
  const keys = noteKeys(app);
  return reconcileNodePositions(app, listIndexableFiles(app, exclusions).map((f) => keys.keyOf(f.path)));
}

/**
 * Purpose: Moves a stored 2D node position to a new path and id when a note is renamed (Issue #250).
 */
export async function moveNodePosition(app: App, oldPath: string, newPath: string): Promise<boolean> {
  const db = await getLocalDb(app);
  const oldId = storedKeyAt(db, "node_positions", oldPath);
  const newId = noteKey(app, newPath);
  const check = db.exec("SELECT id FROM node_positions WHERE id = ? OR path = ?", [oldId, oldPath]);
  if (check.length === 0 || check[0].values.length === 0) return false;

  db.run("DELETE FROM node_positions WHERE (id = ? OR path = ?) AND id != ?", [newId, newPath, oldId]);
  db.run("UPDATE node_positions SET id = ?, path = ?, updated_at = ? WHERE id = ? OR path = ?", [
    newId,
    newPath,
    Date.now(),
    oldId,
    oldPath,
  ]);
  await persistLocalDb(app, db);
  return true;
}

/**
 * Purpose: Deletes a stored node position when a note is deleted or excluded (Issue #250).
 */
export async function deleteNodePosition(app: App, pathOrId: string): Promise<boolean> {
  const db = await getLocalDb(app);
  const id = storedKeyAt(db, "node_positions", pathOrId);
  db.run("DELETE FROM node_positions WHERE id = ? OR path = ?", [id, pathOrId]);
  const modified = db.getRowsModified() > 0;
  if (modified) {
    await persistLocalDb(app, db);
  }
  return modified;
}
