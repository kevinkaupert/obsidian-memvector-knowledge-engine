import type { App, TFile } from "obsidian";
import { stripFrontmatter } from "../../noteContent";
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

const DEFAULT_EXCLUSIONS =
  "-path:schema -file:index -file:log -file:README -file:AGENTS -file:PROFILE -file:canvas- -file:Beweistricks";

/** Obsidian Graph-View-style include/exclude query: `-path:x -file:y term`. */
export function shouldIncludeFile(file: TFile, queryStr: string): boolean {
  if (!queryStr || !queryStr.trim()) return true;

  const tokens = queryStr.trim().split(/\s+/);
  const filePath = file.path.toLowerCase();
  const fileName = file.name.toLowerCase();
  const fileBasename = file.basename.toLowerCase();

  const positiveRules: string[] = [];
  const negativeRules: string[] = [];
  for (const token of tokens) {
    if (!token) continue;
    if (token.startsWith("-")) negativeRules.push(token);
    else positiveRules.push(token);
  }

  for (const rule of negativeRules) {
    if (rule.startsWith("-path:")) {
      const term = rule.slice(6).toLowerCase();
      if (term && filePath.includes(term)) return false;
    } else if (rule.startsWith("-file:")) {
      const term = rule.slice(6).toLowerCase();
      if (term && (fileBasename.includes(term) || fileName.includes(term) || filePath.includes(term))) return false;
    } else {
      const term = rule.slice(1).toLowerCase();
      if (term && (filePath.includes(term) || fileBasename.includes(term) || fileName.includes(term))) return false;
    }
  }

  if (positiveRules.length > 0) {
    let matchesPositive = false;
    for (const rule of positiveRules) {
      if (rule.startsWith("path:")) {
        const term = rule.slice(5).toLowerCase();
        if (term && filePath.includes(term)) {
          matchesPositive = true;
          break;
        }
      } else if (rule.startsWith("file:")) {
        const term = rule.slice(5).toLowerCase();
        if (term && (fileBasename.includes(term) || fileName.includes(term))) {
          matchesPositive = true;
          break;
        }
      } else {
        const term = rule.toLowerCase();
        if (term && (filePath.includes(term) || fileBasename.includes(term))) {
          matchesPositive = true;
          break;
        }
      }
    }
    if (!matchesPositive) return false;
  }

  return true;
}

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export async function scanVaultNotes(app: App, filterQuery: string | undefined, defaultExclusions: string): Promise<ScatterNode[]> {
  const query = filterQuery !== undefined ? filterQuery : defaultExclusions || DEFAULT_EXCLUSIONS;
  const files = app.vault.getMarkdownFiles();
  const nodes: ScatterNode[] = [];

  for (const file of files) {
    if (!shouldIncludeFile(file, query)) continue;

    const content = await app.vault.read(file);
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    let type: ScatterNoteType = "concept";
    let title = file.basename;

    if (frontmatterMatch) {
      const yaml = frontmatterMatch[1];
      const typeMatch = yaml.match(/^type:\s*(.+)$/m);
      if (typeMatch) type = typeMatch[1].trim().toLowerCase() as ScatterNoteType;
      const titleMatch = yaml.match(/^title:\s*(.+)$/m);
      if (titleMatch) title = titleMatch[1].trim().replace(/^['"]|['"]$/g, "");
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
      id: file.basename,
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
