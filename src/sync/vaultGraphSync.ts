import type { App } from "obsidian";
import { toSlug as toNodeSlug } from "../noteSlug";
import type { GraphEdge, GraphNode, GraphStore } from "./graphStore";
import { loadRelationEdges } from "../views/vectorScatter/relationEdges";

/** Scans the vault's WikiLinks into a plain node/edge list - backend-agnostic, used regardless of which GraphStore is configured. */
export function extractVaultGraph(app: App): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodeMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  for (const file of app.vault.getMarkdownFiles()) {
    const slug = toNodeSlug(file.basename);
    nodeMap.set(slug, { id: slug, title: file.basename, path: file.path });

    const cache = app.metadataCache.getFileCache(file);
    for (const link of cache?.links ?? []) {
      const rawLink = link.link.split("#")[0].trim();
      if (!rawLink) continue;
      const destFile = app.metadataCache.getFirstLinkpathDest(rawLink, file.path);
      const targetBasename = destFile ? destFile.basename : (rawLink.split("/").pop() || rawLink);
      const targetSlug = toNodeSlug(targetBasename);
      if (targetSlug) {
        edges.push({ src: slug, tgt: targetSlug, type: "LINKS_TO" });
      }
    }
  }

  return { nodes: Array.from(nodeMap.values()), edges };
}

/** Full-vault graph re-index against whichever GraphStore is currently configured (Memgraph or local SQLite) - includes WikiLinks and typed relations. */
export async function syncVaultGraph(app: App, store: GraphStore): Promise<{ nodeCount: number; edgeCount: number }> {
  const { nodes, edges } = extractVaultGraph(app);
  try {
    const relationEdges = await loadRelationEdges(app);
    for (const rel of relationEdges) {
      edges.push({
        src: rel.srcId,
        tgt: rel.tgtId,
        type: rel.relType,
      });
      if (rel.bidirectional) {
        edges.push({
          src: rel.tgtId,
          tgt: rel.srcId,
          type: rel.relType,
        });
      }
    }
  } catch (err) {
    console.warn("MemVector: Failed to include typed relation edges in sync:", err);
  }
  return store.syncVaultGraph(nodes, edges);
}
