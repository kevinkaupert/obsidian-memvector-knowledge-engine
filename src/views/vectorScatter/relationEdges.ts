import type { App } from "obsidian";
import { pathToId, toSlug } from "../../noteSlug";
import type { RelationEdge } from "./types";
import { shouldIncludeFile } from "./vaultScan";
import { isRelationNote } from "../../relationNotes";
import { DEFAULT_RELATIONS_FOLDER } from "../../vaultLayout";

/**
 * Resolves a relation file's stored WikiLink text (e.g. from `source_note`)
 * to the same canonical path-based id used everywhere else (scanner, graph
 * sync, SQLite) - via Obsidian's own link-resolution API, not string
 * guessing, so same-basename notes in different folders resolve to the
 * correct one. Falls back to a slug of the raw text for a dangling link.
 * Returns null when the target note is excluded, so callers can tell an
 * intentional omission apart from a link that yields no usable id.
 */
function resolveLinkTextToId(app: App, linkText: string, sourcePath: string, exclusions: string): string | null {
  const destFile = app.metadataCache.getFirstLinkpathDest(linkText, sourcePath);
  if (destFile && !shouldIncludeFile(destFile, exclusions)) return null;
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

export interface RelationFilesResult {
  edges: RelationEdge[];
  /** True when any relation note could not be read or is incomplete, i.e. the edge list is partial. */
  hasErrors: boolean;
}

/**
 * Purpose: Loads every explicit relation file, retaining duplicate identities and tracking read errors and incomplete notes.
 * Architecture: Returns hasErrors flag so callers like syncVaultGraph know if the scan was partial (Issues #183, #203).
 * A note without a usable source_note/target_note counts as partial, unlike one whose endpoint is excluded on purpose.
 */
export async function loadRelationFilesResult(
  app: App,
  exclusions = "",
  relationsFolder = DEFAULT_RELATIONS_FOLDER
): Promise<RelationFilesResult> {
  const edges: RelationEdge[] = [];
  let hasErrors = false;
  const files = app.vault.getMarkdownFiles().slice().sort((a, b) => a.path.localeCompare(b.path));

  for (const f of files) {
    const fileCache = app.metadataCache.getFileCache(f);
    if (!isRelationNote(f.path, fileCache?.frontmatter?.type, relationsFolder)) continue;
    if (!shouldIncludeFile(f, exclusions)) continue;
    try {
      let meta = parseRelationMetadata(fileCache?.frontmatter);

      if (!meta.rawSrc || !meta.rawTgt || !meta.desc) {
        const content = await app.vault.read(f);
        meta = parseRelationMetadata(fileCache?.frontmatter, content);
      }

      const srcLinkText = meta.rawSrc.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].trim();
      const tgtLinkText = meta.rawTgt.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].trim();
      const cleanSrc = srcLinkText ? resolveLinkTextToId(app, srcLinkText, f.path, exclusions) : "";
      const cleanTgt = tgtLinkText ? resolveLinkTextToId(app, tgtLinkText, f.path, exclusions) : "";

      // An endpoint in an excluded note is an intentional omission, so its stored edge may be reconciled away.
      if (cleanSrc === null || cleanTgt === null) continue;
      if (!cleanSrc || !cleanTgt) {
        // Missing or unusable link (e.g. frontmatter still being written): the relation is unknown rather than gone,
        // so the read is flagged as partial and graph sync keeps the stored edges instead of deleting them.
        hasErrors = true;
        console.warn(`MemVector: skipping incomplete relation note ${f.path} (missing or unresolvable source_note/target_note)`);
        continue;
      }
      edges.push({
        srcId: cleanSrc,
        tgtId: cleanTgt,
        relType: meta.relType,
        desc: meta.desc,
        title: `${cleanSrc} -> ${cleanTgt}`,
        path: f.path,
        bidirectional: meta.bidirectional,
      });
    } catch (err) {
      hasErrors = true;
      console.warn(`MemVector: skipping unparseable relation note ${f.path}`, err);
    }
  }

  return { edges, hasErrors };
}

/** Loads every explicit relation file, retaining duplicate identities for save conflict checks. */
export async function loadRelationFiles(app: App, exclusions = "", relationsFolder = DEFAULT_RELATIONS_FOLDER): Promise<RelationEdge[]> {
  const result = await loadRelationFilesResult(app, exclusions, relationsFolder);
  return result.edges;
}

export interface RelationEdgesResult {
  edges: RelationEdge[];
  hasErrors: boolean;
}

/**
 * Purpose: Deduplicates graph edges by ordered endpoints and type, reporting any partial load errors.
 * Architecture: Exposes hasErrors indicator so graph sync can skip edge reconciliation on partial reads (Issue #183).
 */
export async function loadRelationEdgesResult(
  app: App,
  exclusions = "",
  relationsFolder = DEFAULT_RELATIONS_FOLDER
): Promise<RelationEdgesResult> {
  const { edges: files, hasErrors } = await loadRelationFilesResult(app, exclusions, relationsFolder);
  const seen = new Set<string>();
  const edges = files.filter((edge) => {
    const key = JSON.stringify([edge.srcId, edge.tgtId, edge.relType]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { edges, hasErrors };
}

/** Deduplicates graph edges by ordered endpoints and type for rendering and graph sync. */
export async function loadRelationEdges(app: App, exclusions = "", relationsFolder = DEFAULT_RELATIONS_FOLDER): Promise<RelationEdge[]> {
  const result = await loadRelationEdgesResult(app, exclusions, relationsFolder);
  return result.edges;
}
