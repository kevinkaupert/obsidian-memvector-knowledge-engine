import type { App } from "obsidian";
import initSqlJs, { type Database } from "sql.js";

const PLUGIN_ID = "obsidian-memvector-knowledge-engine";
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

export function pluginDirPath(app: App): string {
  return `${app.vault.configDir}/plugins/${PLUGIN_ID}`;
}

export function localDbPath(app: App): string {
  return `${pluginDirPath(app)}/${DB_FILENAME}`;
}

let cached: { app: App; db: Promise<Database> } | null = null;

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

/** sql.js keeps the whole database in WASM memory - nothing reaches disk until this is called. Cheap enough to call after every mutating operation given how infrequent they are (a sync button, a relation save/delete), not a hot path. */
export async function persistLocalDb(app: App, db: Database): Promise<void> {
  const bytes = db.export();
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  await app.vault.adapter.writeBinary(localDbPath(app), buffer);
}
