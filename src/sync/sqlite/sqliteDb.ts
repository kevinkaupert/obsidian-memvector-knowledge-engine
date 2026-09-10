import type { App } from "obsidian";
import initSqlJs, { type Database } from "sql.js";
const DB_FILENAME = "memvector-local.sqlite";
const WASM_FILENAME = "sql-wasm.wasm";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, title TEXT, path TEXT);
CREATE TABLE IF NOT EXISTS edges (
  src TEXT, tgt TEXT, type TEXT, description TEXT, bidirectional INTEGER,
  original_term TEXT, updated_at TEXT, PRIMARY KEY (src, tgt, type)
);
CREATE INDEX IF NOT EXISTS idx_edges_src ON edges(src);
CREATE INDEX IF NOT EXISTS idx_edges_tgt ON edges(tgt);
CREATE TABLE IF NOT EXISTS vectors (id TEXT PRIMARY KEY, path TEXT, title TEXT, content TEXT, vector TEXT);
`;

let activePluginId = "obsidian-memvector-knowledge-engine";

export function setPluginId(id: string): void {
  activePluginId = id;
}

export function pluginDirPath(app: App): string {
  return `${app.vault.configDir}/plugins/${activePluginId}`;
}

export function localDbPath(app: App): string {
  return `${pluginDirPath(app)}/${DB_FILENAME}`;
}

let cached: { app: App; db: Promise<Database> } | null = null;
let persistQueue: Promise<void> = Promise.resolve();

async function openDb(app: App): Promise<Database> {
  const wasmBinary = await app.vault.adapter.readBinary(`${pluginDirPath(app)}/${WASM_FILENAME}`);
  const SQL = await initSqlJs({ wasmBinary });

  const dbPath = localDbPath(app);
  const db = (await app.vault.adapter.exists(dbPath)) ? new SQL.Database(new Uint8Array(await app.vault.adapter.readBinary(dbPath))) : new SQL.Database();
  db.run(SCHEMA);
  return db;
}

/** Lazily opens (or creates) the plugin's local SQLite file - shared across every SqliteGraphStore/SqliteVectorStore call within a session, so writes from one don't get clobbered by a stale copy held by the other. */
export async function getLocalDb(app: App): Promise<Database> {
  if (!cached || cached.app !== app) {
    cached = { app, db: openDb(app) };
  }
  return cached.db;
}

/** sql.js keeps the whole database in WASM memory - serialized to disk sequentially to avoid write race conditions. */
export async function persistLocalDb(app: App, db: Database): Promise<void> {
  const bytes = db.export();
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  persistQueue = persistQueue.then(async () => {
    await app.vault.adapter.writeBinary(localDbPath(app), buffer);
  }).catch((err) => {
    console.error("MemVector: Failed to persist local SQLite DB:", err);
  });
  await persistQueue;
}

/** Closes the active database connection and frees WASM memory when the plugin unloads. */
export async function closeLocalDb(): Promise<void> {
  if (cached) {
    const entry = cached;
    cached = null;
    try {
      const db = await entry.db;
      db.close();
    } catch (err) {
      console.warn("MemVector: Error closing SQLite database:", err);
    }
  }
}
