import type { App } from "obsidian";
import type { MemVectorSettings } from "../settings/types";
import type { GraphStore } from "./graphStore";
import { MemgraphGraphStore } from "./memgraph/memgraphGraphStore";
import { SqliteGraphStore } from "./sqlite/sqliteGraphStore";

/** The only place that branches on settings.graphBackend - every call site asks this for "whichever graph store is currently configured" instead of importing Memgraph/SQLite directly. */
export function getGraphStore(app: App, settings: MemVectorSettings): GraphStore {
  return settings.graphBackend === "sqlite" ? new SqliteGraphStore(app) : new MemgraphGraphStore(app, settings);
}
