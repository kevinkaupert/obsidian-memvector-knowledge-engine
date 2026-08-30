import type { App } from "obsidian";
import type { VectorPoint, VectorSearchHit, VectorStore } from "../vectorStore";
import { cosineSimilarity } from "./cosineSimilarity";
import { getLocalDb, persistLocalDb } from "./sqliteDb";

/** VectorStore backed by the plugin's local SQLite file - embeddings stored as a JSON-stringified number[] column, brute-force cosine search in JS at query time (fast enough at personal-vault scale). */
export class SqliteVectorStore implements VectorStore {
  constructor(private readonly app: App) {}

  async testConnection(): Promise<void> {
    await getLocalDb(this.app);
  }

  async syncPoints(points: VectorPoint[]): Promise<void> {
    if (points.length === 0) return;
    const db = await getLocalDb(this.app);
    points.forEach((p) => {
      db.run(
        `INSERT INTO vectors (id, path, title, content, vector) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET path = excluded.path, title = excluded.title, content = excluded.content, vector = excluded.vector`,
        [p.id, p.payload.path, p.payload.title, p.payload.content, JSON.stringify(p.vector)]
      );
    });
    await persistLocalDb(this.app, db);
  }

  async search(vector: number[], limit: number): Promise<VectorSearchHit[]> {
    const db = await getLocalDb(this.app);
    const result = db.exec("SELECT path, title, content, vector FROM vectors");
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

    return scored.sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.trunc(limit)));
  }
}
