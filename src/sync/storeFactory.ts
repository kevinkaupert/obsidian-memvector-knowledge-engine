import type { App } from "obsidian";
import type { MemVectorSettings } from "../settings/types";
import type { GraphStore } from "./graphStore";
import { SqliteGraphStore } from "./sqlite/sqliteGraphStore";
import { SqliteVectorStore } from "./sqlite/sqliteVectorStore";
import type { VectorStore } from "./vectorStore";

/**
 * Purpose: Provides access to the local SQLite graph store instance.
 */
export function getGraphStore(app: App, _settings?: MemVectorSettings): GraphStore {
  return new SqliteGraphStore(app);
}

/**
 * Purpose: Provides access to the local SQLite vector store instance.
 */
export function getVectorStore(app: App, _settings?: MemVectorSettings): VectorStore {
  return new SqliteVectorStore(app);
}


