import type { App } from "obsidian";
import { pathToId, toSlug } from "../noteSlug";
import type { GraphEdge, GraphNode, GraphStore } from "./graphStore";
import { loadRelationEdges } from "../views/vectorScatter/relationEdges";

/**
 * Scans the vault's WikiLinks into a plain node/edge list - backend-agnostic,
 * used regardless of which GraphStore is configured. Node identity is the
 * canonical path-based id (noteSlug.ts::pathToId), so same-basename notes in
 * different folders never collide. Link targets are resolved through
 * Obsidian's own link-resolution API where possible; an unresolved (dangling)
 * link falls back to a slug of its raw text, since there is no real file to
 * derive a path-based id from.
 */
export function extractVaultGraph(app: App): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodeMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  for (const file of app.vault.getMarkdownFiles()) {
    const id = pathToId(file.path);
    nodeMap.set(id, { id, title: file.basename, path: file.path });

    const cache = app.metadataCache.getFileCache(file);
    for (const link of cache?.links ?? []) {
      const rawLink = link.link.split("#")[0].trim();
      if (!rawLink) continue;
      const destFile = app.metadataCache.getFirstLinkpathDest(rawLink, file.path);
      const targetId = destFile ? pathToId(destFile.path) : toSlug(rawLink.split("/").pop() || rawLink);
      if (targetId) {
        edges.push({ src: id, tgt: targetId, type: "LINKS_TO" });
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
