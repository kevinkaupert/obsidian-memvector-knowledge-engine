export interface GraphNode {
  id: string;
  title: string;
  path: string;
}

export interface GraphEdge {
  src: string;
  tgt: string;
  type: string;
}

export interface CypherStatement {
  query: string;
  params: Record<string, unknown>;
}

/** Cypher relationship types are inline identifiers, not bindable params - must be sanitized before interpolation. */
export function sanitizeRelType(type: string): string {
  const cleaned = (type || "")
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "RELATED_TO";
}

/**
 * Parameterized statements for real execution via the driver
 * (sync/memgraph/neo4jDriverAdapter.ts) - no string interpolation of node
 * data, so no Cypher-injection surface from note titles/paths containing
 * quotes (the original main.js only escaped `"` in titles, not at all in
 * paths).
 */
export function buildGraphStatements(nodes: GraphNode[], edges: GraphEdge[]): CypherStatement[] {
  const statements: CypherStatement[] = nodes.map((n) => ({
    query: "MERGE (n:Note {id: $id}) ON CREATE SET n.title = $title, n.path = $path",
    params: { id: n.id, title: n.title, path: n.path },
  }));

  for (const e of edges) {
    statements.push({
      query: `MATCH (a:Note {id: $src}), (b:Note {id: $tgt}) MERGE (a)-[:${sanitizeRelType(e.type)}]->(b)`,
      params: { src: e.src, tgt: e.tgt },
    });
  }

  return statements;
}

function escapeForLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Human-readable literal Cypher text, for the clipboard/Memgraph-Lab-paste preview (RelationBuilderModal). */
export function toCypherText(nodes: GraphNode[], edges: GraphEdge[]): string {
  const lines: string[] = [];
  for (const n of nodes) {
    lines.push(
      `MERGE (n:Note {id: "${escapeForLiteral(n.id)}"}) ON CREATE SET n.title = "${escapeForLiteral(n.title)}", n.path = "${escapeForLiteral(n.path)}";`
    );
  }
  for (const e of edges) {
    lines.push(
      `MATCH (a:Note {id: "${escapeForLiteral(e.src)}"}), (b:Note {id: "${escapeForLiteral(e.tgt)}"}) MERGE (a)-[:${sanitizeRelType(e.type)}]->(b);`
    );
  }
  return lines.join("\n");
}
