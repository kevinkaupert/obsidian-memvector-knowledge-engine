export interface SqlQuery {
  sql: string;
  params: (string | number)[];
}

/**
 * Recursive-CTE equivalent of graphNeighbors.ts's Cypher `MATCH (start)-[*1..hops]-(neighbor)`:
 * walks the `edges` table in both directions (it has no inherent notion of
 * direction for layout/neighbor purposes) up to `hops` steps from the given
 * seed IDs, excluding the seeds themselves. Caller must guard nodeIds.length
 * === 0 - `VALUES ()` with zero rows isn't valid SQL.
 */
export function buildNeighborQuery(nodeIds: string[], hops: number, limit: number): SqlQuery {
  const seedValues = nodeIds.map(() => "(?)").join(", ");
  const excludeSeeds = nodeIds.map(() => "?").join(", ");

  const sql = `
    WITH RECURSIVE reachable(id, hop) AS (
      SELECT column1, 0 FROM (VALUES ${seedValues})
      UNION
      SELECT e.tgt, r.hop + 1 FROM edges e JOIN reachable r ON e.src = r.id WHERE r.hop < ?
      UNION
      SELECT e.src, r.hop + 1 FROM edges e JOIN reachable r ON e.tgt = r.id WHERE r.hop < ?
    )
    SELECT DISTINCT n.id AS id, n.title AS title, n.path AS path
    FROM reachable r JOIN notes n ON n.id = r.id
    WHERE r.hop > 0 AND r.id NOT IN (${excludeSeeds})
    LIMIT ?;
  `;

  return { sql, params: [...nodeIds, hops, hops, ...nodeIds, limit] };
}
