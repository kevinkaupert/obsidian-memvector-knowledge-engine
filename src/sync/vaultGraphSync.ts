import type { App } from "obsidian";
import { pathToId, toSlug } from "../noteSlug";
import type { GraphEdge, GraphNode, GraphStore } from "./graphStore";
import { loadRelationEdges } from "../views/vectorScatter/relationEdges";
import { shouldIncludeFile } from "../vaultFilter";

/**
 * Purpose: Scans the vault's Markdown files into a node list and, when opted in, into LINKS_TO edges from WikiLinks (F03).
 * Architecture: WikiLink extraction is opt-in (includeWikiLinksAsRelations, default false) so the graph store indexes only explicit typed relations unless the user enables raw WikiLink structure (Issue #100, ADR-0001).
 */
export function extractVaultGraph(
  app: App,
  exclusions?: string,
  includeWikiLinksAsRelations = false
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodeMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  for (const file of app.vault.getMarkdownFiles()) {
    if (exclusions && !shouldIncludeFile(file, exclusions)) continue;

    const id = pathToId(file.path);
    nodeMap.set(id, { id, title: file.basename, path: file.path });

    if (!includeWikiLinksAsRelations) continue;

    const cache = app.metadataCache.getFileCache(file);
    for (const link of cache?.links ?? []) {
      const rawLink = link.link.split("#")[0].trim();
      if (!rawLink) continue;
      const destFile = app.metadataCache.getFirstLinkpathDest(rawLink, file.path);
      if (destFile && exclusions && !shouldIncludeFile(destFile, exclusions)) continue;

      const targetId = destFile ? pathToId(destFile.path) : toSlug(rawLink.split("/").pop() || rawLink);
      if (targetId) {
        edges.push({ src: id, tgt: targetId, type: "LINKS_TO" });
      }
    }
  }

  return { nodes: Array.from(nodeMap.values()), edges };
}

/**
 * Purpose: Full-vault graph re-index against the configured GraphStore, applying exclusion filters and synchronizing typed relations (F03).
 * Architecture: WikiLink LINKS_TO edges are only included when includeWikiLinksAsRelations is true (Issue #100, ADR-0001); typed Relation Builder edges are always indexed.
 */
export async function syncVaultGraph(
  app: App,
  store: GraphStore,
  exclusions?: string,
  includeWikiLinksAsRelations = false
): Promise<{ nodeCount: number; edgeCount: number }> {
  const { nodes, edges } = extractVaultGraph(app, exclusions, includeWikiLinksAsRelations);
  const knownNodeIds = new Set(nodes.map((n) => n.id));

  try {
    const relationEdges = await loadRelationEdges(app, exclusions);
    for (const rel of relationEdges) {
      if (exclusions && (!knownNodeIds.has(rel.srcId) || !knownNodeIds.has(rel.tgtId))) {
        continue;
      }
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
