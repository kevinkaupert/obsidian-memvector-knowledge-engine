import type { App } from "obsidian";
import type { RelationEdge } from "./types";

/** Scans only explicit relation notes under wiki/relations/ (written by RelationBuilderModal), not the whole vault. */
export async function loadRelationEdges(app: App): Promise<RelationEdge[]> {
  const edges: RelationEdge[] = [];
  const edgeSet = new Set<string>();
  const files = app.vault.getMarkdownFiles();

  for (const f of files) {
    if (!(f.path.includes("wiki/relation") || f.path.includes("/relations/"))) continue;
    try {
      const content = await app.vault.read(f);
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) continue;

      const yaml = fmMatch[1];
      const srcMatch = yaml.match(/^source_note:\s*["']?\[?\[?([^\]"'\n|]+)/m);
      const tgtMatch = yaml.match(/^target_note:\s*["']?\[?\[?([^\]"'\n|]+)/m);
      const typeMatch = yaml.match(/^relation_type:\s*["']?([^"'\n]+)/m);
      const bidirectionalMatch = yaml.match(/^bidirectional:\s*(true|false)/m);
      const descMatch = content.match(/## Didaktischer \/ Fachlicher Grund\n([\s\S]*?)(?=\n##|$)/i);
      const desc = descMatch ? descMatch[1].trim().replace(/\n+/g, " ") : "";

      if (srcMatch && tgtMatch) {
        const srcId = srcMatch[1].trim().toLowerCase();
        const tgtId = tgtMatch[1].trim().toLowerCase();
        const relType = (typeMatch ? typeMatch[1] : "REQUIRES").trim().toUpperCase();
        const bidirectional = bidirectionalMatch ? bidirectionalMatch[1] === "true" : false;
        const key = `${srcId}->${tgtId}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({ srcId, tgtId, relType, desc, title: `${srcId} -> ${tgtId}`, path: f.path, bidirectional });
        }
      }
    } catch (err) {
      console.debug(`MemVector: skipping unparseable relation note ${f.path}`, err);
    }
  }

  return edges;
}
