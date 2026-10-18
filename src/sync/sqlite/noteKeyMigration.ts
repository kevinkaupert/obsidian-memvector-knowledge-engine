/**
 * Purpose: Moves stored rows to a note's current key (ADR-0007 section 3, #271) instead of re-creating them, so a note
 * keeps its vector, 2D position and edges when it gains or loses a frontmatter `id` or is renamed while MemVector was
 * not running.
 * Architecture: `notes`, `vectors` and `node_positions` store the note path next to the key. For every given note path
 * the row stored at that path under another key is moved to the current key, and a row stored under the current key at
 * another path (an offline rename of a note with `id`) gets the current path. Edges follow every key move. All changes
 * run in one transaction; vectors, hashes, fingerprints and coordinates are kept.
 */

import type { App, TFile } from "obsidian";
import type { Database } from "sql.js";
import { noteKeys } from "../../noteKey";
import { listIndexableFiles } from "../../vaultFilter";
import { getLocalDb, persistLocalDb } from "./sqliteDb";

const TABLES = ["notes", "vectors", "node_positions"] as const;

export interface NoteKeyTarget {
  path: string;
  key: string;
  title: string;
}

/** Applies the key moves for `targets` (current notes) and returns the number of rows changed. */
/**
 * `carriesId(path, key)`: whether the note at `path` has `key` as its frontmatter id, also when it lost the key to a
 * duplicate. Such a row stays with its note; any other row under a note's key belongs to that note (it was moved).
 */
export function migrateNoteKeysInDb(db: Database, targets: NoteKeyTarget[], carriesId: (path: string, key: string) => boolean = () => false): number {
  if (targets.length === 0) return 0;
  const byPath = new Map(targets.map((t) => [t.path, t]));
  const byKey = new Map(targets.map((t) => [t.key, t]));
  const moves = new Map<string, string>();
  let changed = 0;

  db.run("BEGIN");
  try {
    for (const table of TABLES) {
      const result = db.exec(`SELECT id, path FROM ${table}`);
      const rows = result.length === 0 ? [] : result[0].values.map((r) => ({ id: String(r[0]), path: r[1] == null ? "" : String(r[1]) }));
      // Where each row belongs now: a row under a note's key belongs to that note, which may have been renamed while
      // MemVector did not see it, even if a new note took the old path. Otherwise it belongs to the note at its path,
      // under that note's current key (it gained, lost or changed its id; or a duplicated id changed owner).
      const plans = rows.map((row) => {
        const ofKey = byKey.get(row.id);
        if (ofKey && row.path !== ofKey.path && !carriesId(row.path, row.id)) return { row, id: row.id, path: ofKey.path, title: ofKey.title };
        const atPath = byPath.get(row.path);
        if (atPath) return { row, id: atPath.key, path: row.path, title: atPath.title };
        return { row, id: row.id, path: row.path, title: null };
      });
      // Two rows for one key: the row that already holds the key wins (it carries the note's history).
      const winners = new Map<string, (typeof plans)[number]>();
      for (const plan of plans) {
        const current = winners.get(plan.id);
        if (!current || (current.row.id !== plan.id && plan.row.id === plan.id)) winners.set(plan.id, plan);
      }
      const moving: Array<(typeof plans)[number]> = [];
      for (const plan of plans) {
        if (winners.get(plan.id) !== plan) {
          db.run(`DELETE FROM ${table} WHERE id = ?`, [plan.row.id]);
          moves.set(plan.row.id, plan.id);
          changed++;
        } else if (plan.id !== plan.row.id || plan.path !== plan.row.path) {
          moving.push(plan);
        }
      }
      // Via temporary keys, so swapped keys (a duplicated id changing owner) never collide. pathToId encodes ":", so no
      // real key starts with "~move:".
      moving.forEach((plan, i) => db.run(`UPDATE ${table} SET id = ? WHERE id = ?`, [`~move:${i}`, plan.row.id]));
      moving.forEach((plan, i) => {
        if (table === "node_positions") db.run(`UPDATE ${table} SET id = ?, path = ? WHERE id = ?`, [plan.id, plan.path, `~move:${i}`]);
        else db.run(`UPDATE ${table} SET id = ?, path = ?, title = COALESCE(?, title) WHERE id = ?`, [plan.id, plan.path, plan.title, `~move:${i}`]);
        if (plan.id !== plan.row.id) moves.set(plan.row.id, plan.id);
        changed++;
      });
    }
    changed += moveEdges(db, moves);
    db.run("COMMIT");
  } catch (err) {
    db.run("ROLLBACK");
    throw err;
  }
  return changed;
}

/** Moves every edge end along `moves` (old key -> new key); an edge that already exists under the new key wins. */
function moveEdges(db: Database, moves: Map<string, string>): number {
  if (moves.size === 0) return 0;
  let changed = 0;
  const entries = [...moves];
  for (const column of ["src", "tgt"] as const) {
    entries.forEach(([oldId], i) => {
      db.run(`UPDATE OR IGNORE edges SET ${column} = ? WHERE ${column} = ?`, [`~move:${i}`, oldId]);
      changed += db.getRowsModified();
      db.run(`DELETE FROM edges WHERE ${column} = ?`, [oldId]);
    });
    entries.forEach(([, newId], i) => {
      db.run(`UPDATE OR IGNORE edges SET ${column} = ? WHERE ${column} = ?`, [newId, `~move:${i}`]);
      db.run(`DELETE FROM edges WHERE ${column} = ?`, [`~move:${i}`]);
    });
  }
  return changed;
}

/** Moves the stored rows of `targets` to their current keys in the local database and persists a change. */
export async function migrateNoteKeys(app: App, targets: NoteKeyTarget[], carriesId?: (path: string, key: string) => boolean): Promise<number> {
  if (targets.length === 0) return 0;
  const db = await getLocalDb(app);
  const changed = migrateNoteKeysInDb(db, targets, carriesId);
  if (changed > 0) await persistLocalDb(app, db);
  return changed;
}

/**
 * Moves the rows of the given notes (default: every indexable note) to their current keys. Full re-index paths call it
 * first, so a rename or an `id` change made while MemVector was not running is found (ADR-0007 section 3).
 */
export async function migrateVaultNoteKeys(app: App, exclusions: string, files?: TFile[]): Promise<number> {
  const keys = noteKeys(app);
  // A note the metadata cache has not parsed yet (startup) would look id-less; its rows stay where they are.
  const notes = (files ?? listIndexableFiles(app, exclusions)).filter((f) => keys.isKnown(f.path));
  return migrateNoteKeys(app, notes.map((f) => ({ path: f.path, key: keys.keyOf(f.path), title: f.basename })), keys.carriesId);
}
