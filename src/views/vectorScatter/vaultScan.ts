import type { App } from "obsidian";
import { stripFrontmatter } from "../../noteContent";
import { pathToId } from "../../noteSlug";
import type { ScatterNode, ScatterNoteType } from "./types";

const TYPE_OFFSETS: Record<ScatterNoteType, { x: number; y: number }> = {
  definition: { x: -250, y: -150 },
  theorem: { x: 200, y: -150 },
  concept: { x: 0, y: 150 },
  relation: { x: -200, y: 150 },
  synthesis: { x: 250, y: 150 },
  course: { x: 0, y: -250 },
  question: { x: -300, y: 0 },
  source: { x: 300, y: 0 },
};

import { shouldIncludeFile } from "../../vaultFilter";
import { hashString } from "../../hash";
export { shouldIncludeFile };

/**
 * Purpose: Scans markdown notes in the vault, filtering by global indexing exclusions and transient canvas view filter.
 */
export async function scanVaultNotes(app: App, filterQuery: string | undefined, defaultExclusions: string): Promise<ScatterNode[]> {
  const files = app.vault.getMarkdownFiles();
  const nodes: ScatterNode[] = [];

  for (const file of files) {
    if (defaultExclusions && !shouldIncludeFile(file, defaultExclusions)) continue;
    if (filterQuery && !shouldIncludeFile(file, filterQuery)) continue;

    const content = await app.vault.cachedRead(file);
    const fileCache = app.metadataCache.getFileCache(file);
    const fm = fileCache?.frontmatter;
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

    // Bugfix: notes with a long frontmatter block (e.g. a big `sources:`
    // list) previously had their entire truncation window consumed by
    // frontmatter noise, leaving zero real body content for the similarity
    // calc and layout hash to work with. Strip it first.
    const body = stripFrontmatter(content);
    const hash = hashString(title + body.slice(0, 500) + latexMatches.join(""));
    const baseOffset = TYPE_OFFSETS[type] || { x: 0, y: 0 };

    nodes.push({
      id: pathToId(file.path),
      basenameKey: file.basename.toLowerCase(),
      title,
      type,
      path: file.path,
      x: baseOffset.x + ((Math.abs(hash) % 300) - 150),
      y: baseOffset.y + ((Math.abs(hash >> 3) % 300) - 150),
      latexFormulas: latexMatches,
      links: linkMatches,
      content: body.slice(0, 800),
    });
  }

  return nodes;
}
