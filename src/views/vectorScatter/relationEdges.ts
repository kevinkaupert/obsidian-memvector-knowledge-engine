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
      const fileCache = app.metadataCache.getFileCache(f);
      const fm = fileCache?.frontmatter;
      let rawSrc = "";
      let rawTgt = "";
      let relType = "REQUIRES";
      let bidirectional = false;
      let desc = "";

      if (fm) {
        if (typeof fm.source_note === "string") rawSrc = fm.source_note;
        if (typeof fm.target_note === "string") rawTgt = fm.target_note;
        if (typeof fm.relation_type === "string" && fm.relation_type.trim()) relType = fm.relation_type.trim().toUpperCase();
        if (typeof fm.bidirectional === "boolean") bidirectional = fm.bidirectional;
        else if (typeof fm.bidirectional === "string") bidirectional = fm.bidirectional.toLowerCase() === "true";
        if (typeof fm.description === "string") desc = fm.description.trim();
      }

      let content = "";
      if (!rawSrc || !rawTgt || !desc) {
        content = await app.vault.read(f);
        const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (fmMatch) {
          const yaml = fmMatch[1];
          if (!rawSrc) {
            const srcMatch = yaml.match(/^source_note:\s*["']?\[?\[?([^\]"'\r\n|]+)/m);
            if (srcMatch) rawSrc = srcMatch[1];
          }
          if (!rawTgt) {
            const tgtMatch = yaml.match(/^target_note:\s*["']?\[?\[?([^\]"'\r\n|]+)/m);
            if (tgtMatch) rawTgt = tgtMatch[1];
          }
          if (relType === "REQUIRES") {
            const typeMatch = yaml.match(/^relation_type:\s*["']?([^"'\r\n]+)/m);
            if (typeMatch) relType = typeMatch[1].trim().toUpperCase();
          }
          if (!desc) {
            const descFmMatch = yaml.match(/^description:\s*["']?([^"'\r\n]+)["']?/m);
            if (descFmMatch) desc = descFmMatch[1].trim();
          }
        }
      }

      if (!desc && content) {
        const descMatch = content.match(/## (?:Didaktischer \/ Fachlicher Grund|Didactic \/ Academic Reason|Reason|Grund)\r?\n([\s\S]*?)(?=\r?\n##|$)/i);
        if (descMatch) desc = descMatch[1].trim().replace(/\r?\n+/g, " ");
      }

      const cleanSrc = rawSrc.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].trim().toLowerCase();
      const cleanTgt = rawTgt.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].trim().toLowerCase();

      if (cleanSrc && cleanTgt) {
        const key = `${cleanSrc}->${cleanTgt}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({ srcId: cleanSrc, tgtId: cleanTgt, relType, desc, title: `${cleanSrc} -> ${cleanTgt}`, path: f.path, bidirectional });
        }
      }
    } catch (err) {
      console.debug(`MemVector: skipping unparseable relation note ${f.path}`, err);
    }
  }

  return edges;
}
