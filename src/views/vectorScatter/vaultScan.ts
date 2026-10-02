import type { App, TFile } from "obsidian";
import { stripFrontmatter } from "../../noteContent";
import { pathToId } from "../../noteSlug";
import type { ScatterNode, ScatterNoteType } from "./types";
import { shouldIncludeFile } from "../../vaultFilter";
import { isRelationNote } from "../../relationNotes";
export { shouldIncludeFile };

/** The minimal file shape the scan reads: path and names for filtering. */
export interface ScanFileRef {
  path: string;
  name: string;
  basename: string;
}

/** Which notes the 2D view shows: indexing exclusions, the transient view filter and relation-note visibility. */
export interface ScanScope {
  filterQuery?: string;
  exclusions: string;
  relationsDir?: string;
  showRelationNotes: boolean;
}

/**
 * Purpose: Builds the file shape the filters need from a bare path, for paths that no longer exist (deleted files, the
 * old path of a rename).
 */
export function fileRefFromPath(path: string): ScanFileRef {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return { path, name, basename: name.replace(/\.md$/i, "") };
}

/**
 * Purpose: Tells whether a note belongs to the scatter view under the given scope.
 * Architecture: The single inclusion rule for the full scan and for incremental updates, so both agree on the node set.
 */
export function isInScanScope(file: ScanFileRef, frontmatterType: unknown, scope: ScanScope): boolean {
  if (scope.exclusions && !shouldIncludeFile(file, scope.exclusions)) return false;
  if (scope.filterQuery && !shouldIncludeFile(file, scope.filterQuery)) return false;
  if (!scope.showRelationNotes && scope.relationsDir && isRelationNote(file.path, frontmatterType, scope.relationsDir)) return false;
  return true;
}

/** Frontmatter `type` of a note from the metadata cache, if cached. */
export function cachedFrontmatterType(app: App, file: TFile): string | undefined {
  const fm = app.metadataCache?.getFileCache(file)?.frontmatter;
  return typeof fm?.type === "string" ? fm.type : undefined;
}

/**
 * Purpose: Reads one note into an unplaced scatter node.
 */
export async function buildScatterNode(app: App, file: TFile): Promise<ScatterNode> {
  const fm = app.metadataCache?.getFileCache(file)?.frontmatter;
  const content = await app.vault.cachedRead(file);
  let type: ScatterNoteType = "concept";
  let title = file.basename;

  if (fm) {
    if (typeof fm.type === "string" && fm.type.trim()) {
      type = fm.type.trim().toLowerCase() as ScatterNoteType;
    }
    if (typeof fm.title === "string" && fm.title.trim()) {
      title = fm.title.trim().replace(/^['"]|['"]$/g, "");
    }
  } else {
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (frontmatterMatch) {
      const yaml = frontmatterMatch[1];
      const typeMatch = yaml.match(/^type:\s*(.+)$/m);
      if (typeMatch) type = typeMatch[1].trim().toLowerCase() as ScatterNoteType;
      const titleMatch = yaml.match(/^title:\s*(.+)$/m);
      if (titleMatch) title = titleMatch[1].trim().replace(/^['"]|['"]$/g, "");
    }
  }

  const latexMatches = [...content.matchAll(/\$\$?([\s\S]+?)\$\$?/g)].map((m) => m[1].trim());
  const linkMatches = [...content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map((m) => m[1].trim().toLowerCase());
  const body = stripFrontmatter(content);

  return {
    id: pathToId(file.path),
    basenameKey: file.basename.toLowerCase(),
    title,
    type,
    path: file.path,
    x: 0,
    y: 0,
    placed: false,
    latexFormulas: latexMatches,
    links: linkMatches,
    content: body.slice(0, 800),
  };
}

/**
 * Purpose: Scans markdown notes in the vault deterministically, filtering by exclusions, view filter, and relation note visibility.
 */
export async function scanVaultNotes(
  app: App,
  filterQuery: string | undefined,
  defaultExclusions: string,
  relationsDir?: string,
  showRelationNotes = false
): Promise<ScatterNode[]> {
  const files = app.vault.getMarkdownFiles().slice().sort((a, b) => a.path.localeCompare(b.path, "en"));
  const scope: ScanScope = { filterQuery, exclusions: defaultExclusions, relationsDir, showRelationNotes };
  const nodes: ScatterNode[] = [];

  for (const file of files) {
    if (!isInScanScope(file, cachedFrontmatterType(app, file), scope)) continue;
    nodes.push(await buildScatterNode(app, file));
  }

  return nodes;
}
