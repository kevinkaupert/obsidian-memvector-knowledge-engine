import type { TranslationKeys } from "../../i18n";
import type { ResolvedRelationEdge } from "../../relationVocabulary/resolveTerm";
import { toSlug, wikiLinkTarget } from "../../noteSlug";
import { DEFAULT_RELATIONS_FOLDER } from "../../vaultLayout";
import { serializeFrontmatter } from "../../frontmatterYaml";
import { newNoteId } from "../../noteId";

/**
 * Keep a short readable prefix, but derive identity from the complete ordered IDs
 * and label. Slugs alone collapse folders, punctuation and component boundaries.
 * SHA-256 also bounds filename length without introducing a native dependency.
 */
export async function relationFilePath(edge: ResolvedRelationEdge, folder: string = DEFAULT_RELATIONS_FOLDER): Promise<string> {
  const identity = JSON.stringify([edge.src.id, edge.tgt.id, edge.label]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const src = toSlug(edge.src.id).slice(0, 32);
  const tgt = toSlug(edge.tgt.id).slice(0, 32);
  const label = toSlug(edge.label).slice(0, 32);
  return `${folder}/rel-${src}-to-${tgt}-${label}-${hash}.md`;
}

/**
 * Reuse existing paths by semantic identity, including legacy filenames. This
 * preserves in-place edits and lets the normal conflict guard reject duplicates
 * without mistaking an unrelated legacy slug collision for the same relation.
 */
export async function relationFilePaths(
  edges: ResolvedRelationEdge[],
  existing: { srcId: string; tgtId: string; relType: string; path: string }[],
  initialEdgePath?: string,
  folder: string = DEFAULT_RELATIONS_FOLDER
): Promise<string[]> {
  return Promise.all(edges.map((edge) => {
    const matches = existing.filter((entry) =>
      entry.srcId === edge.src.id && entry.tgtId === edge.tgt.id && entry.relType === edge.label
    );
    // If duplicate files already exist, do not silently edit through that conflict.
    const match = matches.find((entry) => entry.path !== initialEdgePath) || matches[0];
    return match ? Promise.resolve(match.path) : relationFilePath(edge, folder);
  }));
}

export function buildRelationFileContent(
  edge: ResolvedRelationEdge,
  description: string,
  t: TranslationKeys
): string {
  // WikiLink targets must be the note's actual path (resolvable by Obsidian), never
  // `.id` - that's the canonical slug used for graph/vector storage, not a link target.
  const srcLink = `[[${wikiLinkTarget(edge.src.path)}|${edge.src.title}]]`;
  const tgtLink = `[[${wikiLinkTarget(edge.tgt.path)}|${edge.tgt.title}]]`;
  const descText = description || `${t.relDefaultDesc} ${edge.label} ${t.relBetween} ${srcLink} ${t.relAnd} ${tgtLink}.`;
  const bidirectionalText = edge.bidirectional ? t.relBidirectionalYes : t.relBidirectionalNo;

  // knowOS vault schema: endpoints live in source_note/target_note only; `sources` is reserved for
  // evidence and omitted here. The content comes from the user's Relation Builder input, so
  // `generated.by` is "user". A fresh `id` (ADR-0002) is replaced by the existing one on edit.
  const frontmatter = serializeFrontmatter({
    id: newNoteId(),
    type: "relation",
    title: `${edge.src.title} -> ${edge.tgt.title} (${edge.label})`,
    description: descText,
    status: "draft",
    generated: {
      by: "user",
      at: new Date().toISOString(),
    },
    relation_type: edge.label,
    original_term: edge.originalTerm,
    bidirectional: edge.bidirectional,
    source_note: srcLink,
    target_note: tgtLink,
  });

  return `${frontmatter}
# ${t.relFileHeading}: ${srcLink} -> ${tgtLink}

- **${t.relFileType}:** \`${edge.label}\`
- **${t.relFileOriginalTerm}:** ${edge.originalTerm}
- **${t.relFileBidirectional}:** ${bidirectionalText}
- **${t.relFileSource}:** ${srcLink}
- **${t.relFileTarget}:** ${tgtLink}

## ${t.relFileReason}
${descText}
`;
}

