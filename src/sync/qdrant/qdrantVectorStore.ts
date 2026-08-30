import type { App } from "obsidian";
import { getQdrantApiKey } from "../../settings/secrets";
import type { MemVectorSettings } from "../../settings/types";
import type { VectorPoint, VectorSearchHit, VectorStore } from "../vectorStore";
import { testQdrantConnection } from "./connectionTest";
import { ensureCollection, searchSimilar, upsertPoints, type QdrantPoint } from "./qdrantClient";
import { pointIdForPath } from "./pointId";

/** VectorStore backed by a real Qdrant server over REST - thin wrapper around the existing client (unchanged internally). Point IDs are plain strings (the note path) at the interface level; Qdrant needs a numeric/UUID ID, so pointIdForPath's hash is applied here rather than leaking that detail to callers. */
export class QdrantVectorStore implements VectorStore {
  constructor(
    private readonly app: App,
    private readonly settings: MemVectorSettings
  ) {}

  private baseUrl(): string {
    return (this.settings.qdrantUrl || "http://localhost:6333").replace(/\/+$/, "");
  }

  private collection(): string {
    return this.settings.qdrantCollection || "obsidian_wiki_vectors";
  }

  private apiKey(): string {
    return getQdrantApiKey(this.app);
  }

  testConnection(): Promise<void> {
    return testQdrantConnection(this.baseUrl(), this.apiKey());
  }

  async syncPoints(points: VectorPoint[]): Promise<void> {
    if (points.length === 0) return;
    await ensureCollection(this.baseUrl(), this.collection(), this.apiKey());
    const qdrantPoints: QdrantPoint[] = points.map((p) => ({ id: pointIdForPath(p.id), vector: p.vector, payload: p.payload }));
    await upsertPoints(this.baseUrl(), this.collection(), this.apiKey(), qdrantPoints);
  }

  search(vector: number[], limit: number): Promise<VectorSearchHit[]> {
    return searchSimilar(this.baseUrl(), this.collection(), this.apiKey(), vector, limit);
  }
}
