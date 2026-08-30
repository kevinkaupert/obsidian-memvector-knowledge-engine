import type { App } from "obsidian";
import type { MemVectorSettings } from "../settings/types";
import type { GraphStore } from "./graphStore";
import { MemgraphGraphStore } from "./memgraph/memgraphGraphStore";
import { QdrantVectorStore } from "./qdrant/qdrantVectorStore";
import { SqliteGraphStore } from "./sqlite/sqliteGraphStore";
import { SqliteVectorStore } from "./sqlite/sqliteVectorStore";
import type { VectorStore } from "./vectorStore";

/** The only place that branches on settings.graphBackend - every call site asks this for "whichever graph store is currently configured" instead of importing Memgraph/SQLite directly. */
export function getGraphStore(app: App, settings: MemVectorSettings): GraphStore {
  return settings.graphBackend === "sqlite" ? new SqliteGraphStore(app) : new MemgraphGraphStore(app, settings);
}

/** The only place that branches on settings.vectorBackend - every call site asks this for "whichever vector store is currently configured" instead of importing Qdrant/SQLite directly. */
export function getVectorStore(app: App, settings: MemVectorSettings): VectorStore {
  return settings.vectorBackend === "sqlite" ? new SqliteVectorStore(app) : new QdrantVectorStore(app, settings);
}
