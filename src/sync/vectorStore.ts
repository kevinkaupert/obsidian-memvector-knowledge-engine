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
 * Purpose: Defines the vector storage interface for indexing, searching, and reconciling note embeddings.
 * In v0.1.x, this interface is backed by SqliteVectorStore via local sql.js WebAssembly.
 */
export interface VectorStore {
  testConnection(): Promise<void>;
  syncPoints(points: VectorPoint[]): Promise<void>;
  search(vector: number[], limit: number): Promise<VectorSearchHit[]>;
  /** Looks up a single already-synced point's own embedding by id (note path) - null if it hasn't been synced yet. Lets a caller search "by note" without re-computing an embedding. */
  getVector(id: string): Promise<number[] | null>;
  /** Bulk form of getVector, for hydrating many nodes' embeddings (e.g. before a layout pass) without one query per node. Paths with no stored vector are simply absent from the result. */
  getVectors(ids: string[]): Promise<Map<string, number[]>>;
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
