import type { App } from "obsidian";
import { toSlug as toNodeSlug } from "../noteSlug";
import type { GraphEdge, GraphNode, GraphStore } from "./graphStore";

/** Scans the vault's WikiLinks into a plain node/edge list - backend-agnostic, used regardless of which GraphStore is configured. */
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

/** Full-vault graph re-index against whichever GraphStore is currently configured (Memgraph or local SQLite) - replaces the old Memgraph-only syncVaultToMemgraph(). */
export async function syncVaultGraph(app: App, store: GraphStore): Promise<{ nodeCount: number; edgeCount: number }> {
  const { nodes, edges } = extractVaultGraph(app);
  return store.syncVaultGraph(nodes, edges);
}
