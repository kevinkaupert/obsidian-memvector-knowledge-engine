import { stripFrontmatter } from "../../noteContent";
import { shouldIncludeFile } from "../vectorScatter/vaultScan";

export interface NoteFileLike {
  path: string;
  name: string;
  basename: string;
}

export type RadarNoteType =
  | "definition"
  | "theorem"
  | "concept"
  | "relation"
  | "synthesis"
  | "course"
  | "question"
  | "source";

export interface ScoredNote {
  file: NoteFileLike;
  type: RadarNoteType;
  score: number;
  formulas: string[];
  content: string;
}

const EXCLUDED_NAME_SUBSTRINGS = ["index", "log", "README", "AGENTS", "PROFILE", "canvas-"];

export function shouldExcludeFromRadar(file: NoteFileLike, exclusions?: string): boolean {
  if (exclusions) {
    return !shouldIncludeFile(file, exclusions);
  }
  return file.path.includes("schema") || EXCLUDED_NAME_SUBSTRINGS.some((s) => file.name.includes(s));
}

export function classifyNoteType(path: string, name: string): RadarNoteType {
  if (path.includes("/definitions/") || name.includes("def-")) return "definition";
  if (path.includes("/theorems/") || name.includes("satz-") || name.includes("theorem-")) return "theorem";
  if (path.includes("/relations/")) return "relation";
  if (path.includes("/synthesis/")) return "synthesis";
  if (path.includes("/courses/")) return "course";
  if (path.includes("/questions/")) return "question";
  if (path.includes("/sources/") || path.includes("raw/")) return "source";
  return "concept";
}

export function extractWords(content: string): Set<string> {
  return new Set(content.toLowerCase().match(/\b[a-z0-9_]{3,}\b/g) || []);
}

export function extractFormulas(content: string): string[] {
  return [...content.matchAll(/\$\$?([\s\S]+?)\$\$?/g)].map((m) => m[1].trim());
}

function scoreAgainstActive(activeWords: Set<string>, activeFormulas: Set<string>, candidateContent: string): { score: number; formulas: string[] } {
  const fWords = candidateContent.toLowerCase().match(/\b[a-z0-9_]{3,}\b/g) || [];
  const fFormulas = extractFormulas(candidateContent);

  let intersectCount = 0;
  for (const w of fWords) {
    if (activeWords.has(w)) intersectCount++;
  }
  let formulaMatchCount = 0;
  for (const form of fFormulas) {
    if (activeFormulas.has(form)) formulaMatchCount += 5;
  }

  const score = (intersectCount + formulaMatchCount * 3) / Math.max(1, activeWords.size + fWords.length);
  return { score, formulas: fFormulas };
}

/** Ranks candidate notes by textual/formula similarity to the active note's content, highest first. */
export function rankCandidates(
  activeContent: string,
  candidates: { file: NoteFileLike; content: string }[]
): ScoredNote[] {
  const activeBody = stripFrontmatter(activeContent);
  const activeWords = extractWords(activeBody);
  const activeFormulas = new Set(extractFormulas(activeBody));

  const scored = candidates.map(({ file, content }) => {
    const body = stripFrontmatter(content);
    const { score, formulas } = scoreAgainstActive(activeWords, activeFormulas, body);
    return { file, type: classifyNoteType(file.path, file.name), score, formulas, content: body };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}
