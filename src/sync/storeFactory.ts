import type { App } from "obsidian";
import type { MemVectorSettings } from "../settings/types";
import type { GraphStore } from "./graphStore";
import { SqliteGraphStore } from "./sqlite/sqliteGraphStore";
import { SqliteVectorStore } from "./sqlite/sqliteVectorStore";
import { resolveEmbeddingTarget } from "./embeddingTarget";
import type { VectorStore } from "./vectorStore";

/**
 * Purpose: Provides access to the local SQLite graph store instance.
 */
export function getGraphStore(app: App, _settings?: MemVectorSettings): GraphStore {
  return new SqliteGraphStore(app);
}

/**
 * Purpose: Provides the local SQLite vector store, scoped to the vector space of the configured embedding model and
 * endpoint - settings are required so no caller can read or write vectors of another model by accident.
 */
export function getVectorStore(app: App, settings: MemVectorSettings): VectorStore {
  return new SqliteVectorStore(app, resolveEmbeddingTarget(settings).fingerprint);
}


