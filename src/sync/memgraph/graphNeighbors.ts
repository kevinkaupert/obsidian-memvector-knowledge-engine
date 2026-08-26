import type { App } from "obsidian";
import type { MemVectorSettings } from "../../settings/types";
import { connect } from "./neo4jDriverAdapter";

export interface GraphNeighbor {
  id: string;
  title: string;
  path: string;
}

/** Notes within `hops` graph-steps (any relationship type) of the given node IDs, excluding the given IDs themselves. */
export async function fetchGraphNeighbors(app: App, settings: MemVectorSettings, nodeIds: string[], hops: number, limit: number): Promise<GraphNeighbor[]> {
  if (nodeIds.length === 0) return [];

  // Memgraph rejects a parameterized LIMIT ("must be an integer" even when
  // the JS number genuinely is one - neo4j-driver-lite sends plain numbers
  // as floats). Both hops and limit are internally-clamped integers, never
  // raw user text, so inlining them is safe (same reasoning as sanitizeRelType).
  const safeHops = Math.max(1, Math.min(Math.trunc(hops), 3));
  const safeLimit = Math.max(1, Math.trunc(limit));

  const connection = connect(app, settings);
  try {
    const rows = await connection.query<{ id: string; title: string; path: string }>(
      `MATCH (start:Note) WHERE start.id IN $ids
       MATCH (start)-[*1..${safeHops}]-(neighbor:Note)
       WHERE NOT neighbor.id IN $ids
       RETURN DISTINCT neighbor.id AS id, neighbor.title AS title, neighbor.path AS path
       LIMIT ${safeLimit}`,
      { ids: nodeIds }
    );
    return rows;
  } finally {
    await connection.close();
  }
}
