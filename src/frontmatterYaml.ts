import { stringifyYaml, parseYaml } from "obsidian";

/**
 * Purpose: Unified frontmatter serialization, parsing, and merging helper for synthesis and relation notes (#246, #247).
 * Architecture: Serializes frontmatter using Obsidian's stringifyYaml so titles and descriptions
 * containing quotes, colons, hash symbols, or line breaks remain valid YAML. When editing relations,
 * unknown frontmatter fields (e.g. `id`, custom metadata) and note body outside the generated section are preserved.
 */

/**
 * Serializes a frontmatter record into a standard YAML frontmatter block delimited by `---`.
 */
export function serializeFrontmatter(fields: Record<string, unknown>): string {
  const yaml = stringifyYaml(fields).trim();
  return `---\n${yaml}\n---\n`;
}

/**
 * Parses the frontmatter of a markdown file into an object, or returns null if no frontmatter is found.
 */
export function parseFrontmatter(fileContent: string): Record<string, unknown> | null {
  const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  try {
    return (parseYaml(match[1]) || {}) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Splits a markdown note into its frontmatter text, parsed frontmatter object, and body content.
 */
export function splitFrontmatterAndBody(fileContent: string): {
  frontmatterText: string | null;
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatterText: null, frontmatter: {}, body: fileContent };
  }
  let frontmatter: Record<string, unknown> = {};
  try {
    const parsed: unknown = parseYaml(match[1]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      frontmatter = parsed as Record<string, unknown>;
    }
  } catch {
    frontmatter = {};
  }
  return {
    frontmatterText: match[1],
    frontmatter,
    body: match[2],
  };
}

/**
 * Matches the generated relation heading in German or English.
 */
const RELATION_HEADING_REGEX = /^#\s+(?:Relation|Beziehung)\b.*$/im;

/**
 * Matches the generated reason heading in German or English.
 */
const REASON_HEADING_REGEX = /^##\s+(?:Didaktischer \/ Fachlicher Grund|Didactic \/ Academic Reason|Reason|Grund)\b.*$/im;

/**
 * Extracts custom user body content that was written outside the generated section (#246).
 * Any content preceding the generated relation heading is considered a user prefix.
 * Any content following the reason section is considered a user suffix.
 */
export function extractUserBodyOutsideGenerated(
  existingBody: string,
  oldDesc: string = ""
): { userPrefix: string; userSuffix: string } {
  const normalizedBody = existingBody.replace(/\r\n/g, "\n");
  const headingMatch = normalizedBody.match(RELATION_HEADING_REGEX) ?? normalizedBody.match(/^#\s+[^\r\n]+/m);
  let userPrefix = "";
  let generatedStart = 0;

  if (headingMatch && headingMatch.index !== undefined && headingMatch.index > 0) {
    userPrefix = normalizedBody.slice(0, headingMatch.index).trim();
    generatedStart = headingMatch.index;
  }

  const fromHeading = normalizedBody.slice(generatedStart);
  const reasonMatch = fromHeading.match(REASON_HEADING_REGEX);

  if (!reasonMatch || reasonMatch.index === undefined) {
    if (!headingMatch) {
      return { userPrefix: "", userSuffix: normalizedBody.trim() };
    }
    return { userPrefix, userSuffix: "" };
  }

  const afterReasonHeaderIdx = reasonMatch.index + reasonMatch[0].length;
  const afterReason = fromHeading.slice(afterReasonHeaderIdx);

  // If oldDesc is present and matches the beginning of afterReason, consume it first (#246)
  // so any Markdown headings inside the description (e.g. ### Evidence) are not mistaken for custom content.
  const trimmedAfter = afterReason.trimStart();
  const normalizedOldDesc = oldDesc.replace(/\r\n/g, "\n").trim();
  if (normalizedOldDesc && trimmedAfter.startsWith(normalizedOldDesc)) {
    const userSuffix = trimmedAfter.slice(normalizedOldDesc.length).trim();
    return { userPrefix, userSuffix };
  }

  // If oldDesc was not matching or absent, check if there is another heading after the reason section
  const nextHeadingMatch = afterReason.match(/\n(?=#{1,6}\s)/);
  if (nextHeadingMatch && nextHeadingMatch.index !== undefined) {
    const userSuffix = afterReason.slice(nextHeadingMatch.index).trim();
    return { userPrefix, userSuffix };
  }

  return { userPrefix, userSuffix: "" };
}

/**
 * Merges an existing relation note with freshly generated relation content,
 * preserving unknown frontmatter fields and note body outside the generated section (#246).
 */
export function mergeRelationNoteContent(existingContent: string, newContent: string): string {
  const existing = splitFrontmatterAndBody(existingContent);
  const fresh = splitFrontmatterAndBody(newContent);

  // If neither has frontmatter (e.g. plain test strings in unit tests), do not alter newContent
  if (existing.frontmatterText === null && fresh.frontmatterText === null) {
    return newContent;
  }

  // Preserve unknown frontmatter fields and update MemVector-owned fields
  const mergedFrontmatter: Record<string, unknown> = {
    ...existing.frontmatter,
    ...fresh.frontmatter,
  };

  const oldDesc = typeof existing.frontmatter.description === "string"
    ? existing.frontmatter.description.trim()
    : "";

  const { userPrefix, userSuffix } = extractUserBodyOutsideGenerated(existing.body, oldDesc);

  let mergedBody = fresh.body.trim();
  if (userPrefix) {
    mergedBody = `${userPrefix}\n\n${mergedBody}`;
  }
  if (userSuffix) {
    mergedBody = `${mergedBody}\n\n${userSuffix}`;
  }

  return `${serializeFrontmatter(mergedFrontmatter)}\n${mergedBody}\n`;
}
