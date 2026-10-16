import { hashString } from "../hash";
import { parseFrontmatter } from "../frontmatterYaml";
import { capText, stripFrontmatter } from "../noteContent";

export interface EmbeddingInput {
  /** Exact text sent to the embedding provider. */
  text: string;
  /** Content hash of `text` - validates a stored vector as a cache hit. */
  hash: string;
  /** Note body without frontmatter, uncapped - for payload excerpts. */
  body: string;
}

/**
 * Purpose: Renders the configured frontmatter keys as `key: value` lines, in the order given
 * (#251). Missing or empty keys are skipped; lists are joined with ", "; nested objects are
 * not embedded.
 */
export function frontmatterEmbeddingLines(rawContent: string, keys: readonly string[]): string[] {
  if (keys.length === 0) return [];
  const fm = parseFrontmatter(rawContent);
  if (!fm) return [];
  const lines: string[] = [];
  for (const key of keys) {
    const value = scalarText(fm[key]);
    if (value) lines.push(`${key}: ${value}`);
  }
  return lines;
}

function scalarText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(scalarText).filter(Boolean).join(", ");
  return "";
}

/**
 * Purpose: Parses the comma-separated `embeddingFrontmatterKeys` setting into a key list,
 * dropping blanks and duplicates while keeping the order.
 */
export function parseEmbeddingFrontmatterKeys(setting: string | undefined): string[] {
  return [...new Set((setting ?? "").split(",").map((k) => k.trim()).filter(Boolean))];
}

/**
 * Purpose: Builds the canonical embedding text (file basename + optional frontmatter lines +
 * frontmatter-stripped body, capped at `maxChars`, 0 = no cap) and its cache hash for one note.
 * Architecture: Every indexing path (Settings vault sync, scatter toolbar) must build its
 * text here. The stored content hash is only comparable across paths when both embed the
 * identical text; any divergence turns every run of the other path into a full cache miss.
 * The hash covers the capped text, so changing the cap invalidates exactly the notes whose
 * embedded text actually changes. With no frontmatter keys the text is exactly the
 * pre-#251 text, so existing vectors stay cache hits; with keys, only notes whose
 * configured fields are set get a different text and are re-embedded.
 */
export function buildEmbeddingInput(basename: string, rawContent: string, maxChars: number, frontmatterKeys: readonly string[] = []): EmbeddingInput {
  const body = stripFrontmatter(rawContent);
  const head = [basename, ...frontmatterEmbeddingLines(rawContent, frontmatterKeys)].join("\n");
  const text = capText(`${head}\n${body}`, maxChars);
  return { text, hash: String(hashString(text)), body };
}
