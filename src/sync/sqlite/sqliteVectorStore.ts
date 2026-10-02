import type { App } from "obsidian";
import type { Database } from "sql.js";
import type { StoredVectorHash, VectorPoint, VectorSearchHit, VectorStore } from "../vectorStore";
import { cosineSimilarity } from "./cosineSimilarity";
import { flushLocalDb, getLocalDb, persistLocalDb } from "./sqliteDb";

/**
 * VectorStore backed by the plugin's local SQLite file - embeddings stored as a JSON-stringified number[] column, brute-force cosine search in JS at query time (fast enough at personal-vault scale).
 *
 * Scoped to one embedding fingerprint (model + endpoint, see resolveEmbeddingTarget): writes stamp it on every row, and
 * reads, hashes and search only see rows with the same fingerprint, so vectors from another model are never mixed in and
 * count as cache misses. Rows written before fingerprints existed (NULL) have unknown provenance: a scoped store never
 * sees them, so they are re-embedded - and overwritten - instead of being attributed to whatever model is configured
 * now. `fingerprint: null` leaves the store unscoped.
 */
export class SqliteVectorStore implements VectorStore {
  constructor(
    private readonly app: App,
    private readonly fingerprint: string | null = null
  ) {}

  async testConnection(): Promise<void> {
    await this.openDb();
  }

  private async openDb(): Promise<Database> {
    return getLocalDb(this.app);
  }

  /** SQL condition + params restricting a query to this store's fingerprint (no-op when unscoped). */
  private scope(): { where: string; params: string[] } {
    return this.fingerprint === null ? { where: "1 = 1", params: [] } : { where: "embedding_fingerprint = ?", params: [this.fingerprint] };
  }

  /**
   * Purpose: Persists vector points, embeddings, content hashes, mtimes and this store's embedding fingerprint to SQLite with conflict resolution.
   */
  async syncPoints(points: VectorPoint[]): Promise<void> {
    if (points.length === 0) return;
    const db = await this.openDb();
    points.forEach((p) => {
      // Purge any legacy rows stored under a different ID (e.g. raw path vs pathToId hash)
      db.run("DELETE FROM vectors WHERE path = ? AND id != ?", [p.payload.path, p.id]);
      db.run(
        `INSERT INTO vectors (id, path, title, content, vector, content_hash, mtime, embedding_fingerprint) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET path = excluded.path, title = excluded.title, content = excluded.content, vector = excluded.vector, content_hash = excluded.content_hash, mtime = excluded.mtime, embedding_fingerprint = excluded.embedding_fingerprint`,
        [p.id, p.payload.path, p.payload.title, p.payload.content, JSON.stringify(p.vector), p.contentHash ?? null, p.mtime ?? null, this.fingerprint]
      );
    });
    await persistLocalDb(this.app, db);
  }

  async getVector(id: string): Promise<number[] | null> {
    const db = await this.openDb();
    const { where, params } = this.scope();
    const result = db.exec(`SELECT vector FROM vectors WHERE (id = ? OR path = ?) AND ${where}`, [id, id, ...params]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return JSON.parse(String(result[0].values[0][0])) as number[];
  }

  async getVectors(ids: string[]): Promise<Map<string, number[]>> {
    const found = new Map<string, number[]>();
    if (ids.length === 0) return found;
    const db = await this.openDb();
    const { where, params } = this.scope();
    const result = db.exec(`SELECT id, path, vector FROM vectors WHERE ${where}`, params);
    if (result.length === 0) return found;

    const wanted = new Set(ids);
    const { columns, values } = result[0];
    const idx = { id: columns.indexOf("id"), path: columns.indexOf("path"), vector: columns.indexOf("vector") };
    for (const row of values) {
      const id = String(row[idx.id]);
      const path = String(row[idx.path]);
      const vector = JSON.parse(String(row[idx.vector])) as number[];
      if (wanted.has(id)) {
        found.set(id, vector);
      }
      if (wanted.has(path)) {
        found.set(path, vector);
      }
    }
    return found;
  }

  /**
   * Purpose: Retrieves persisted content hashes and modification timestamps to enable incremental embedding skips.
   * Rows from another embedding fingerprint are left out, so a model/endpoint change turns them into cache misses.
   */
  async getStoredHashes(): Promise<Map<string, StoredVectorHash>> {
    const found = new Map<string, StoredVectorHash>();
    const db = await this.openDb();
    const { where, params } = this.scope();
    const result = db.exec(`SELECT id, path, content_hash, mtime FROM vectors WHERE content_hash IS NOT NULL AND ${where}`, params);
    if (result.length === 0) return found;

    const { columns, values } = result[0];
    const idx = {
      id: columns.indexOf("id"),
      path: columns.indexOf("path"),
      hash: columns.indexOf("content_hash"),
      mtime: columns.indexOf("mtime"),
    };

    for (const row of values) {
      const id = String(row[idx.id]);
      const path = String(row[idx.path]);
      const hash = String(row[idx.hash]);
      const rawMtime = row[idx.mtime];
      const entry: StoredVectorHash = {
        hash,
        mtime: rawMtime != null ? Number(rawMtime) : undefined,
      };
      found.set(id, entry);
      found.set(path, entry);
    }
    return found;
  }

  async reconcile(currentPaths: string[]): Promise<{ removed: number }> {
    const db = await this.openDb();
    const current = new Set(currentPaths);

    const result = db.exec("SELECT path FROM vectors");
    const existingPaths = result.length === 0 ? [] : result[0].values.map((row) => String(row[0]));

    let removed = 0;
    for (const path of existingPaths) {
      if (!current.has(path)) {
        db.run("DELETE FROM vectors WHERE path = ?", [path]);
        removed++;
      }
    }

    if (removed > 0) await persistLocalDb(this.app, db);
    return { removed };
  }

  async flush(): Promise<void> {
    await this.openDb();
    await flushLocalDb(this.app);
  }

  async search(vector: number[], limit: number): Promise<VectorSearchHit[]> {
    const db = await this.openDb();
    const { where, params } = this.scope();
    const result = db.exec(`SELECT path, title, content, vector FROM vectors WHERE ${where} ORDER BY path ASC`, params);
    if (result.length === 0) return [];

    const { columns, values } = result[0];
    const idx = {
      path: columns.indexOf("path"),
      title: columns.indexOf("title"),
      content: columns.indexOf("content"),
      vector: columns.indexOf("vector"),
    };

    const scored: VectorSearchHit[] = values.map((row) => ({
      score: cosineSimilarity(vector, JSON.parse(String(row[idx.vector])) as number[]),
      payload: { path: String(row[idx.path]), title: String(row[idx.title]), content: String(row[idx.content]) },
    }));

    const sorted = scored.sort((a, b) => (b.score - a.score) || a.payload.path.localeCompare(b.payload.path, "en"));
    return limit > 0 ? sorted.slice(0, Math.trunc(limit)) : sorted;
  }
}
