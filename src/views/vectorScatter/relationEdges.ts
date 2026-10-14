import type { App } from "obsidian";
import { pathToId, toSlug } from "../../noteSlug";
import type { RelationEdge } from "./types";
import { shouldIncludeFile } from "./vaultScan";
import { isRelationNote } from "../../relationNotes";
import { DEFAULT_RELATIONS_FOLDER } from "../../vaultLayout";
import { buildLinkKeys, loadFrontmatterLinkEdges } from "../../frontmatterLinks";

/**
 * Resolves a relation file's stored WikiLink text (e.g. from `source_note`)
 * to the same canonical path-based id used everywhere else (scanner, graph
 * sync, SQLite) - via Obsidian's own link-resolution API, not string
 * guessing, so same-basename notes in different folders resolve to the
 * correct one. Falls back to a slug of the raw text for a dangling link.
 * Returns null when the target note is excluded, so callers can tell an
 * intentional omission apart from a link that yields no usable id.
 */
export function resolveLinkTextToId(app: App, linkText: string, sourcePath: string, exclusions: string): string | null {
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
  const files = app.vault.getMarkdownFiles().slice().sort((a, b) => a.path.localeCompare(b.path, "en"));

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
 * Purpose: Merges relation-note edges and frontmatter typed-link edges into one list with one entry per edge.
 * Architecture: An edge is identified by ordered endpoints and canonical label (knowOS vault schema). Relation notes
 * come first and win, since they carry description and sources; a bidirectional relation note also covers the
 * reverse frontmatter link. Among frontmatter links a confirmed one wins over a suggested one (#243).
 */
export function mergeRelationEdges(relationNoteEdges: RelationEdge[], frontmatterEdges: RelationEdge[]): RelationEdge[] {
  const keyOf = (src: string, tgt: string, type: string) => JSON.stringify([src, tgt, type]);
  const seen = new Set<string>();
  // Reverse directions of bidirectional relation notes: they cover frontmatter links only, so relation-note
  // deduplication keeps its pre-#243 behavior.
  const coveredReverse = new Set<string>();
  const merged: RelationEdge[] = [];
  for (const edge of relationNoteEdges) {
    const key = keyOf(edge.srcId, edge.tgtId, edge.relType);
    if (seen.has(key)) continue;
    seen.add(key);
    if (edge.bidirectional) coveredReverse.add(keyOf(edge.tgtId, edge.srcId, edge.relType));
    merged.push(edge);
  }
  for (const key of coveredReverse) seen.add(key);
  const ordered = [...frontmatterEdges].sort((a, b) => Number(a.confidence === "suggested") - Number(b.confidence === "suggested"));
  for (const edge of ordered) {
    const key = keyOf(edge.srcId, edge.tgtId, edge.relType);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(edge);
  }
  return merged;
}

/**
 * Purpose: Loads the deduplicated graph edges from relation notes and, when labels are given, from frontmatter
 * typed links, reporting any partial relation-note read.
 * Architecture: Exposes hasErrors indicator so graph sync can skip edge reconciliation on partial reads (Issue #183).
 * Without `linkLabels` only relation notes are read, as before #243.
 */
export async function loadRelationEdgesResult(
  app: App,
  exclusions = "",
  relationsFolder = DEFAULT_RELATIONS_FOLDER,
  linkLabels: Iterable<string> = []
): Promise<RelationEdgesResult> {
  const { edges: files, hasErrors } = await loadRelationFilesResult(app, exclusions, relationsFolder);
  const frontmatterEdges = loadFrontmatterLinkEdges(
    app,
    buildLinkKeys(linkLabels),
    (linkText, sourcePath) => resolveLinkTextToId(app, linkText, sourcePath, exclusions),
    pathToId,
    exclusions,
    relationsFolder
  );
  return { edges: mergeRelationEdges(files, frontmatterEdges), hasErrors };
}

/** Loads the deduplicated graph edges for rendering and graph sync. */
export async function loadRelationEdges(
  app: App,
  exclusions = "",
  relationsFolder = DEFAULT_RELATIONS_FOLDER,
  linkLabels: Iterable<string> = []
): Promise<RelationEdge[]> {
  const result = await loadRelationEdgesResult(app, exclusions, relationsFolder, linkLabels);
  return result.edges;
}
