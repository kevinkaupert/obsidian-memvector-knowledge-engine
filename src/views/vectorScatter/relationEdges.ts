import type { App } from "obsidian";
import { pathToId, toSlug } from "../../noteSlug";
import type { RelationEdge } from "./types";
import { shouldIncludeFile } from "./vaultScan";

/**
 * Resolves a relation file's stored WikiLink text (e.g. from `source_note`)
 * to the same canonical path-based id used everywhere else (scanner, graph
 * sync, SQLite) - via Obsidian's own link-resolution API, not string
 * guessing, so same-basename notes in different folders resolve to the
 * correct one. Falls back to a slug of the raw text for a dangling link.
 */
function resolveLinkTextToId(app: App, linkText: string, sourcePath: string, exclusions: string): string {
  const destFile = app.metadataCache.getFirstLinkpathDest(linkText, sourcePath);
  if (destFile && !shouldIncludeFile(destFile, exclusions)) return "";
  return destFile ? pathToId(destFile.path) : toSlug(linkText);
}

export interface RawRelationMetadata {
  rawSrc: string;
  rawTgt: string;
  relType: string;
  bidirectional: boolean;
  desc: string;
}

/**
 * Purpose: Extracts relation frontmatter fields with regex fallback from raw content.
 */
export function parseRelationMetadata(
  fm?: Record<string, unknown> | null,
  fileContent?: string
): RawRelationMetadata {
  let rawSrc = "";
  let rawTgt = "";
  let relType = "REQUIRES";
  let bidirectional = false;
  let desc = "";

  if (fm) {
    if (typeof fm.source_note === "string") rawSrc = fm.source_note;
    if (typeof fm.target_note === "string") rawTgt = fm.target_note;
    if (typeof fm.relation_type === "string" && fm.relation_type.trim()) {
      relType = fm.relation_type.trim().toUpperCase();
    }
    if (typeof fm.bidirectional === "boolean") {
      bidirectional = fm.bidirectional;
    } else if (typeof fm.bidirectional === "string") {
      bidirectional = fm.bidirectional.toLowerCase() === "true";
    }
    if (typeof fm.description === "string") desc = fm.description.trim();
  }

  if (fileContent && (!rawSrc || !rawTgt || !desc)) {
    const fmMatch = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
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

    if (!desc) {
      const descMatch = fileContent.match(/## (?:Didaktischer \/ Fachlicher Grund|Didactic \/ Academic Reason|Reason|Grund)\r?\n([\s\S]*?)(?=\r?\n##|$)/i);
      if (descMatch) desc = descMatch[1].trim().replace(/\r?\n+/g, " ");
    }
  }

  return { rawSrc, rawTgt, relType, bidirectional, desc };
}

/** Loads every explicit relation file, retaining duplicate identities for save conflict checks. */
export async function loadRelationFiles(app: App, exclusions = ""): Promise<RelationEdge[]> {
  const edges: RelationEdge[] = [];
  const files = app.vault.getMarkdownFiles();

  for (const f of files) {
    if (!(f.path.includes("wiki/relation") || f.path.includes("/relations/"))) continue;
    if (!shouldIncludeFile(f, exclusions)) continue;
    try {
      const fileCache = app.metadataCache.getFileCache(f);
      let meta = parseRelationMetadata(fileCache?.frontmatter);

      if (!meta.rawSrc || !meta.rawTgt || !meta.desc) {
        const content = await app.vault.read(f);
        meta = parseRelationMetadata(fileCache?.frontmatter, content);
      }

      const srcLinkText = meta.rawSrc.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].trim();
      const tgtLinkText = meta.rawTgt.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].trim();
      const cleanSrc = srcLinkText ? resolveLinkTextToId(app, srcLinkText, f.path, exclusions) : "";
      const cleanTgt = tgtLinkText ? resolveLinkTextToId(app, tgtLinkText, f.path, exclusions) : "";

      if (cleanSrc && cleanTgt) {
        edges.push({
          srcId: cleanSrc,
          tgtId: cleanTgt,
          relType: meta.relType,
          desc: meta.desc,
          title: `${cleanSrc} -> ${cleanTgt}`,
          path: f.path,
          bidirectional: meta.bidirectional,
        });
      }
    } catch (err) {
      console.debug(`MemVector: skipping unparseable relation note ${f.path}`, err);
    }
  }

  return edges;
}

/** Deduplicates graph edges by ordered endpoints and type for rendering and graph sync. */
export async function loadRelationEdges(app: App, exclusions = ""): Promise<RelationEdge[]> {
  const files = await loadRelationFiles(app, exclusions);
  const seen = new Set<string>();
  return files.filter((edge) => {
    const key = JSON.stringify([edge.srcId, edge.tgtId, edge.relType]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
