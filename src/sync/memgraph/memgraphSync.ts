import type { App } from "obsidian";
import type { MemVectorSettings } from "../../settings/types";
import { buildGraphStatements, type GraphEdge, type GraphNode } from "./cypherBuilder";
import { connect } from "./neo4jDriverAdapter";
import { toNodeSlug } from "./slug";

export interface MemgraphSyncResult {
  nodeCount: number;
  edgeCount: number;
}

export function extractVaultGraph(app: App): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodeMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  for (const file of app.vault.getMarkdownFiles()) {
    const slug = toNodeSlug(file.basename);
    nodeMap.set(slug, { id: slug, title: file.basename, path: file.path });

    const cache = app.metadataCache.getFileCache(file);
    for (const link of cache?.links ?? []) {
      const targetSlug = toNodeSlug(link.link.split("#")[0]);
      if (targetSlug) {
        edges.push({ src: slug, tgt: targetSlug, type: "LINKS_TO" });
      }
    }
  }

  return { nodes: Array.from(nodeMap.values()), edges };
}

/**
 * Real Memgraph sync (Bugfix #1) - replaces the HTTP-Cypher handler that
 * always silently failed. See neo4jDriverAdapter.ts for why.
 */
export async function syncVaultToMemgraph(app: App, settings: MemVectorSettings): Promise<MemgraphSyncResult> {
  const { nodes, edges } = extractVaultGraph(app);
  const statements = buildGraphStatements(nodes, edges);

  const connection = connect(settings);
  try {
    await connection.runStatements(statements);
  } finally {
    await connection.close();
  }

  return { nodeCount: nodes.length, edgeCount: edges.length };
}
