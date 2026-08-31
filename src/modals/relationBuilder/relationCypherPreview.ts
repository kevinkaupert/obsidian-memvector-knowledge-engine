import type { RelationNode } from "./relationEdgeBuilder";
import type { ResolvedRelationEdge } from "../../relationVocabulary/resolveTerm";

/**
 * This is a *different* Cypher shape than sync/memgraph/cypherBuilder.ts:
 * aliased multi-node MERGE + edge properties (description/paths/timestamp)
 * + a RETURN clause, purpose-built for a human-readable Memgraph Lab
 * paste-preview of a *specific* hand-picked relation, not the bulk
 * whole-vault sync. Kept separate rather than forced into a shared
 * abstraction that doesn't actually fit both use cases.
 */
export function buildRelationCypherPreview(edges: ResolvedRelationEdge[], description: string): string {
  const descEscaped = (description || "").replace(/"/g, '\\"');
  const lines: string[] = [];
  const nodeMap = new Map<string, { alias: string; node: RelationNode }>();
  let nodeCounter = 0;

  edges.forEach((e) => {
    if (!nodeMap.has(e.src.id)) nodeMap.set(e.src.id, { alias: `n${nodeCounter++}`, node: e.src });
    if (!nodeMap.has(e.tgt.id)) nodeMap.set(e.tgt.id, { alias: `n${nodeCounter++}`, node: e.tgt });
  });

  Array.from(nodeMap.values()).forEach(({ alias, node }) => {
    const titleEscaped = node.title.replace(/"/g, '\\"');
    lines.push(`MERGE (${alias}:Note {id: "${node.id}"}) ON CREATE SET ${alias}.title = "${titleEscaped}", ${alias}.path = "${node.path}", ${alias}.type = "${node.type}"`);
  });

  edges.forEach((e, idx) => {
    const srcAlias = nodeMap.get(e.src.id)!.alias;
    const tgtAlias = nodeMap.get(e.tgt.id)!.alias;
    const termEscaped = e.originalTerm.replace(/"/g, '\\"');
    lines.push(
      `MERGE (${srcAlias})-[r${idx}:${e.label} { description: "${descEscaped}", original_term: "${termEscaped}", bidirectional: ${e.bidirectional}, source_path: "${e.src.path}", target_path: "${e.tgt.path}", created_at: datetime() }]->(${tgtAlias})`
    );
  });

  const returnParts = edges.map((_, idx) => `r${idx}`).join(", ");
  lines.push(`RETURN ${returnParts};`);

  return lines.join("\n");
}
