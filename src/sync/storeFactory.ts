import type { App } from "obsidian";
import type { MemVectorSettings } from "../settings/types";
import type { GraphStore } from "./graphStore";
import { SqliteGraphStore } from "./sqlite/sqliteGraphStore";
import { SqliteVectorStore } from "./sqlite/sqliteVectorStore";
import type { VectorStore } from "./vectorStore";

export function getGraphStore(app: App, _settings?: MemVectorSettings): GraphStore {
  return new SqliteGraphStore(app);
}

export function getVectorStore(app: App, _settings?: MemVectorSettings): VectorStore {
  return new SqliteVectorStore(app);
}

