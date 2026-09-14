import type { TranslationKeys } from "../../i18n";
import type { ResolvedRelationEdge } from "../../relationVocabulary/resolveTerm";
import { toSlug, wikiLinkTarget } from "../../noteSlug";

/**
 * Includes the relation type/label, not just the endpoints - two different
 * relation types between the same ordered pair (e.g. REQUIRES and
 * CONFLICTS_WITH between the same notes) must land in different files, or
 * creating the second one silently overwrites the first (F06). SQLite has
 * always kept them as separate edges via its (src, tgt, type) primary key;
 * the file path previously did not.
 */
export function relationFilePath(edge: ResolvedRelationEdge): string {
  return `wiki/relations/rel-${toSlug(edge.src.id)}-to-${toSlug(edge.tgt.id)}-${toSlug(edge.label)}.md`;
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

  return `---
type: relation
title: "${edge.src.title} -> ${edge.tgt.title} (${edge.label})"
description: "${descText.replace(/"/g, '\\"')}"
status: draft
sources:
  - "${edge.src.path}"
  - "${edge.tgt.path}"
generated:
  by: "MemVector Co-Pilot"
  at: "${new Date().toISOString()}"
verified: null
relation_type: "${edge.label}"
original_term: "${edge.originalTerm.replace(/"/g, '\\"')}"
bidirectional: ${edge.bidirectional}
source_note: "${srcLink}"
target_note: "${tgtLink}"
---

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

