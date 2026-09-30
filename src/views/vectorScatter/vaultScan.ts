import type { App } from "obsidian";
import { stripFrontmatter } from "../../noteContent";
import { pathToId } from "../../noteSlug";
import type { ScatterNode, ScatterNoteType } from "./types";
import { shouldIncludeFile } from "../../vaultFilter";
import { isRelationNote } from "../../relationNotes";
export { shouldIncludeFile };

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
  const files = app.vault.getMarkdownFiles().slice().sort((a, b) => a.path.localeCompare(b.path));
  const nodes: ScatterNode[] = [];

  for (const file of files) {
    if (defaultExclusions && !shouldIncludeFile(file, defaultExclusions)) continue;
    if (filterQuery && !shouldIncludeFile(file, filterQuery)) continue;

    const fileCache = app.metadataCache?.getFileCache(file);
    const fm = fileCache?.frontmatter;
    const rawFmType = typeof fm?.type === "string" ? fm.type : undefined;

    if (!showRelationNotes && relationsDir && isRelationNote(file.path, rawFmType, relationsDir)) {
      continue;
    }

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

    nodes.push({
      id: pathToId(file.path),
      basenameKey: file.basename.toLowerCase(),
      title,
      type,
      path: file.path,
      x: 0,
      y: 0,
      latexFormulas: latexMatches,
      links: linkMatches,
      content: body.slice(0, 800),
    });
  }

  return nodes;
}
