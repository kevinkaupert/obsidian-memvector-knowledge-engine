export interface VectorPoint {
  id: string;
  vector: number[];
  payload: { path: string; title: string; content: string };
}

export interface VectorSearchHit {
  score: number;
  payload: { path: string; title: string; content: string };
}

/**
 * Whatever the plugin needs from the vector index, independent of where it
 * actually lives (Qdrant over REST, or a local SQLite table with brute-force
 * cosine search). qdrant/qdrantVectorStore.ts and sqlite/sqliteVectorStore.ts
 * both implement this; storeFactory.ts picks which one based on
 * settings.vectorBackend. Point IDs are plain strings here (usually the note
 * path) - QdrantVectorStore hashes them to Qdrant's required numeric ID
 * internally via pointId.ts, callers never see that detail.
 */
export interface VectorStore {
  testConnection(): Promise<void>;
  syncPoints(points: VectorPoint[]): Promise<void>;
  search(vector: number[], limit: number): Promise<VectorSearchHit[]>;
  /** Looks up a single already-synced point's own embedding by id (note path) - null if it hasn't been synced yet. Lets a caller search "by note" without re-computing an embedding. */
  getVector(id: string): Promise<number[] | null>;
  /**
   * Full-vault re-index cleanup: deletes any stored point whose path is not
   * in `currentPaths` (deleted/renamed/newly-excluded files) - separate from
   * syncPoints so a caller can reconcile against the complete current file
   * list regardless of which individual points got a fresh embedding this
   * run. Callers must pass the complete current list, and skip calling this
   * at all when that list couldn't be fully determined (e.g. an aborted
   * embedding pass), rather than pass a partial one.
   */
  reconcile(currentPaths: string[]): Promise<{ removed: number }>;
}
