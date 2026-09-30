import { hashString } from "../hash";
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
 * Purpose: Builds the canonical embedding text (file basename + frontmatter-stripped body,
 * capped at `maxChars`, 0 = no cap) and its cache hash for one note.
 * Architecture: Every indexing path (Settings vault sync, scatter toolbar) must build its
 * text here. The stored content hash is only comparable across paths when both embed the
 * identical text; any divergence turns every run of the other path into a full cache miss.
 * The hash covers the capped text, so changing the cap invalidates exactly the notes whose
 * embedded text actually changes.
 */
export function buildEmbeddingInput(basename: string, rawContent: string, maxChars: number): EmbeddingInput {
  const body = stripFrontmatter(rawContent);
  const text = capText(`${basename}\n${body}`, maxChars);
  return { text, hash: String(hashString(text)), body };
}
