import { newNoteId } from "./noteId";
import { generatedBy } from "./noteProvenance";
import { wikiLinkTarget } from "./noteSlug";

export interface SynthesisNode {
  id: string;
  title: string;
  path: string;
}

/**
 * Purpose: Frontmatter of a saved synthesis note per the knowOS vault schema: `sources` as quoted
 * wikilinks (kept current on rename), `generated.by` as memvector/<provider>:<model>, and a fresh
 * `id` (ADR-0002).
 */
export function synthesisFrontmatter(
  nodes: SynthesisNode[],
  title: string,
  description: string,
  provider: string | undefined,
  model: string,
  now: Date = new Date()
): Record<string, unknown> {
  return {
    id: newNoteId(now.getTime()),
    type: "synthesis",
    title,
    description,
    status: "draft",
    sources: nodes.map((n) => `[[${wikiLinkTarget(n.path)}|${n.title}]]`),
    generated: { by: generatedBy(provider, model), at: now.toISOString() },
  };
}

// Characters that cannot appear in a file name or break a [[link]]; also `%`, so nothing looks URL-encoded (#277).
const INVALID_NAME_CHARS = /[\\/:*?"<>|#^[\]%]/g;

/**
 * Purpose: Base file name of a synthesis note from the selected notes' titles: one flat name, no folder
 * separators or percent-encoding, at most 50 characters after the `synthese-` prefix (#277). The caller adds the
 * folder, `.md` and a counter for uniqueness.
 */
export function synthesisBaseName(nodes: Pick<SynthesisNode, "title" | "path">[]): string {
  const parts = nodes.map((n) => {
    const name = n.title || (n.path.split("/").pop() ?? "").replace(/\.md$/i, "");
    return name.replace(INVALID_NAME_CHARS, " ").trim().split(/\s+/).join("-").toLowerCase();
  });
  const slug = parts.filter(Boolean).join("-").slice(0, 50).replace(/^[-.]+|[-.]+$/g, "");
  return `synthese-${slug || "notiz"}`;
}
