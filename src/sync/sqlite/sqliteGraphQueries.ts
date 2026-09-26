export interface SqlQuery {
  sql: string;
  params: (string | number)[];
}

/**
 * Purpose: Recursive-CTE equivalent of Cypher `MATCH (start)-[*1..hops]-(neighbor)`.
 * Architecture: Walks edges bidirectionally up to `hops` steps, deduplicates multi-path nodes
 * by MIN(hop) distance (Issue #102), and partitions by hop so dense hop-1 neighborhoods do not
 * starve deeper hops from GraphRAG context (Issue #103).
 */
export function buildNeighborQuery(
  nodeIds: string[],
  hops: number,
  limit: number,
  perHopLimit = 0
): SqlQuery {
  if (nodeIds.length === 0) {
    return { sql: "", params: [] };
  }

  const seedValues = nodeIds.map(() => "(?)").join(", ");
  const excludeSeeds = nodeIds.map(() => "?").join(", ");

  const sql = `
    WITH RECURSIVE reachable(id, hop) AS (
      SELECT column1, 0 FROM (VALUES ${seedValues})
      UNION
      SELECT e.tgt, r.hop + 1 FROM edges e JOIN reachable r ON e.src = r.id WHERE r.hop < ?
      UNION
      SELECT e.src, r.hop + 1 FROM edges e JOIN reachable r ON e.tgt = r.id WHERE r.hop < ?
    ),
    min_hop AS (
      SELECT id, MIN(hop) AS hop
      FROM reachable
      WHERE hop > 0 AND id NOT IN (${excludeSeeds})
      GROUP BY id
    ),
    ranked AS (
      SELECT id, hop, ROW_NUMBER() OVER (PARTITION BY hop ORDER BY id ASC) AS rn
      FROM min_hop
    )
    SELECT n.id AS id, n.title AS title, n.path AS path, rk.hop AS hops
    FROM ranked rk
    JOIN notes n ON n.id = rk.id
    WHERE (? <= 0 OR rk.rn <= ?)
    ORDER BY rk.hop ASC, rk.id ASC
    LIMIT ?;
  `;

  const effectiveLimit = limit > 0 ? limit : -1;
  return {
    sql,
    params: [
      ...nodeIds,
      hops,
      hops,
      ...nodeIds,
      perHopLimit,
      perHopLimit,
      effectiveLimit,
    ],
  };
}

