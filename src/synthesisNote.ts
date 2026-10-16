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
