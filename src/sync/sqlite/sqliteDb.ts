import type { App } from "obsidian";
import initSqlJs, { type Database } from "sql.js";
import { getEmbeddedWasmBinary } from "./embeddedWasm";
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
CREATE TABLE IF NOT EXISTS vectors (
  id TEXT PRIMARY KEY, path TEXT, title TEXT, content TEXT, vector TEXT,
  content_hash TEXT, mtime INTEGER, embedding_fingerprint TEXT
);
`;

let activePluginId = "memvector-knowledge-engine";
let activePluginDir = "";

/**
 * Purpose: Configures custom plugin directory path directly from manifest.dir.
 */
export function setPluginDir(dir: string): void {
  activePluginDir = dir;
}

/**
 * Purpose: Sets plugin id for default path resolution.
 */
export function setPluginId(id: string): void {
  activePluginId = id;
}

/**
 * Purpose: Resolves the active plugin folder inside the vault config directory.
 */
export function pluginDirPath(app: App): string {
  if (activePluginDir) return activePluginDir;
  return `${app.vault.configDir}/plugins/${activePluginId}`;
}

export function localDbPath(app: App): string {
  return `${pluginDirPath(app)}/${DB_FILENAME}`;
}

let cached: { app: App; db: Promise<Database> } | null = null;
let persistQueue: Promise<void> = Promise.resolve();
/** True while the in-memory database holds changes the last completed write did not put on disk. */
let unpersisted = false;
/** Sequence number of the most recently requested write - only its success proves the file is current. */
let latestWriteSeq = 0;

/** Initializes sql.js engine with disk or embedded fallback WASM, then opens or creates the local database. */
async function openDb(app: App): Promise<Database> {
  const dir = pluginDirPath(app);
  const wasmPath = `${dir}/${WASM_FILENAME}`;
  let wasmBinary: ArrayBuffer;
  if (await app.vault.adapter.exists(wasmPath)) {
    wasmBinary = await app.vault.adapter.readBinary(wasmPath);
  } else {
    const embedded = getEmbeddedWasmBinary();
    const buffer = embedded.buffer.slice(embedded.byteOffset, embedded.byteOffset + embedded.byteLength) as ArrayBuffer;
    wasmBinary = buffer;
    try {
      if (typeof app.vault.adapter.mkdir === "function" && !(await app.vault.adapter.exists(dir))) {
        await app.vault.adapter.mkdir(dir);
      }
      await app.vault.adapter.writeBinary(wasmPath, buffer);
    } catch {
      // Non-fatal if writing fallback to disk fails
    }
  }
  const SQL = await initSqlJs({ wasmBinary });

  const dbPath = localDbPath(app);
  const db = (await app.vault.adapter.exists(dbPath)) ? new SQL.Database(new Uint8Array(await app.vault.adapter.readBinary(dbPath))) : new SQL.Database();
  db.run(SCHEMA);
  try {
    db.run("ALTER TABLE vectors ADD COLUMN content_hash TEXT;");
  } catch {
    // Column already exists or table freshly created with column
  }
  try {
    db.run("ALTER TABLE vectors ADD COLUMN mtime INTEGER;");
  } catch {
    // Column already exists or table freshly created with column
  }
  try {
    db.run("ALTER TABLE vectors ADD COLUMN embedding_fingerprint TEXT;");
  } catch {
    // Column already exists or table freshly created with column
  }
  return db;
}

/** Lazily opens (or creates) the plugin's local SQLite file - shared across every SqliteGraphStore/SqliteVectorStore call within a session, so writes from one don't get clobbered by a stale copy held by the other. */
export async function getLocalDb(app: App): Promise<Database> {
  if (!cached || cached.app !== app) {
    cached = { app, db: openDb(app) };
    unpersisted = false;
  }
  return cached.db;
}

/**
 * sql.js keeps the whole database in WASM memory - serialized to disk sequentially to avoid
 * write race conditions. The shared queue is kept always-settled so one failed write does not
 * block subsequent writes from being attempted; the failure is instead propagated to the
 * caller of this specific call via the returned/thrown promise.
 *
 * A failed write leaves the changes in memory only; they stay flagged as unpersisted until a
 * later write succeeds, so flushLocalDb can still put them on disk (see there).
 */
export async function persistLocalDb(app: App, db: Database): Promise<void> {
  unpersisted = true;
  const seq = ++latestWriteSeq;
  const bytes = db.export();
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

  const dir = pluginDirPath(app);
  const thisWrite = persistQueue.then(async () => {
    try {
      if (typeof app.vault.adapter.mkdir === "function" && !(await app.vault.adapter.exists(dir))) {
        await app.vault.adapter.mkdir(dir);
      }
    } catch {
      // Non-fatal if directory creation fails or already exists
    }
    await app.vault.adapter.writeBinary(localDbPath(app), buffer);
  });
  persistQueue = thisWrite.catch(() => undefined);

  try {
    await thisWrite;
    // Each write exports the full in-memory DB, so the newest successful write covers every earlier change.
    if (seq === latestWriteSeq) unpersisted = false;
  } catch (err) {
    console.error("MemVector: Failed to persist local SQLite DB:", err);
    throw err;
  }
}

/**
 * Purpose: Writes the in-memory database to disk if it holds changes a previous write failed to persist.
 * Architecture: sql.js applies every change in memory before the file write. After a failed write, content hashes of
 * the new vectors are visible to the next indexing run, which then treats those notes as cache hits and writes
 * nothing - reporting success for data that exists only in memory. Indexing paths call this before reporting success.
 * Throws if the write fails again.
 */
export async function flushLocalDb(app: App): Promise<void> {
  if (!unpersisted) return;
  const db = await getLocalDb(app);
  if (!unpersisted) return;
  await persistLocalDb(app, db);
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
