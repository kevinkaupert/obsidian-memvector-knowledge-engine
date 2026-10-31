import initSqlJs from "sql.js";

/**
 * Purpose: `memvector graph neighbors` (knowOS ADR-0010, ADR-0014, Plan 0017 step 2): the relations of one note from
 * MemVector's graph, without Obsidian, so an agent can follow them ("Ventil REQUIRES Dichtung").
 * Architecture: Reads the `notes` and `edges` tables of the index from bytes and never writes them. A note is found
 * by its vault path; the edges are the ones the plugin's graph sync stored (relation notes and typed frontmatter
 * links). Answers with the agent envelope only.
 */

export interface Neighbor {
  /** The relation type as stored, e.g. REQUIRES. */
  type: string;
  /** "out": this note is the edge's source; "in": its target. A bidirectional edge is listed once, as "out". */
  direction: "out" | "in";
  bidirectional: boolean;
  path: string;
  title: string;
  description: string;
}

export type NeighborsResult =
  | { v: 1; outcome: "ok"; data: { note: string; title: string; neighbors: Neighbor[]; truncated: boolean } }
  | { v: 1; outcome: "error"; error: { code: string; message: string } };

function failure(code: string, message: string): NeighborsResult {
  return { v: 1, outcome: "error", error: { code, message } };
}

export async function graphNeighbors(db: Uint8Array, wasm: Uint8Array, notePath: string, limit = 100): Promise<NeighborsResult> {
  const SQL = await initSqlJs({ wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer });
  let database;
  try {
    database = new SQL.Database(db);
    const cleanPath = notePath.replace(/^\.[/\\]+/, "");
    const found = database.exec("SELECT id, title FROM notes WHERE path = ? LIMIT 1", [cleanPath]);
    if (found.length === 0 || found[0].values.length === 0) {
      return failure("NOTE_NOT_INDEXED", `MemVector's graph has no note ${notePath}; open the vault in Obsidian and let MemVector index it.`);
    }
    const [id, title] = found[0].values[0];
    const rows = database.exec(
      `SELECT e.type, e.description, e.bidirectional, e.src, n.path, n.title
         FROM edges e JOIN notes n ON n.id = CASE WHEN e.src = ? THEN e.tgt ELSE e.src END
        WHERE (e.src = ? OR e.tgt = ?) AND e.src != e.tgt
        ORDER BY e.type, n.path`,
      [id, id, id]
    );
    const neighbors: Neighbor[] = rows.length === 0 ? [] : rows[0].values.map((r) => ({
      type: String(r[0]),
      description: r[1] === null ? "" : String(r[1]),
      bidirectional: Number(r[2]) === 1,
      direction: String(r[3]) === String(id) ? "out" : "in",
      path: String(r[4]),
      title: r[5] === null ? "" : String(r[5]),
    }));
    return { v: 1, outcome: "ok", data: { note: notePath, title: title === null ? "" : String(title), neighbors: neighbors.slice(0, Math.max(1, limit)), truncated: neighbors.length > Math.max(1, limit) } };
  } catch (err) {
    return failure("INDEX_UNREADABLE", `The index cannot be read: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    database?.close();
  }
}
