import type { TranslationKeys } from "../../i18n";
import { buildRelationCypherPreview } from "./relationCypherPreview";
import type { ResolvedRelationEdge } from "../../relationVocabulary/resolveTerm";

export function relationFilePath(edge: ResolvedRelationEdge): string {
  return `wiki/relations/rel-${edge.src.id}-to-${edge.tgt.id}.md`;
}

export function buildRelationFileContent(
  edge: ResolvedRelationEdge,
  description: string,
  t: TranslationKeys,
  graphBackend: "memgraph" | "sqlite" = "memgraph"
): string {
  const descText = description || `${t.relDefaultDesc} ${edge.label} ${t.relBetween} [[${edge.src.id}|${edge.src.title}]] ${t.relAnd} [[${edge.tgt.id}|${edge.tgt.title}]].`;
  const bidirectionalText = edge.bidirectional ? t.relBidirectionalYes : t.relBidirectionalNo;

  return `---
type: relation
title: "${edge.src.title} ➔ ${edge.tgt.title} (${edge.label})"
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
source_note: "[[${edge.src.id}|${edge.src.title}]]"
target_note: "[[${edge.tgt.id}|${edge.tgt.title}]]"
---

# ${t.relFileHeading}: [[${edge.src.id}|${edge.src.title}]] ➤ [[${edge.tgt.id}|${edge.tgt.title}]]

- **${t.relFileType}:** \`${edge.label}\`
- **${t.relFileOriginalTerm}:** ${edge.originalTerm}
- **${t.relFileBidirectional}:** ${bidirectionalText}
- **${t.relFileSource}:** [[${edge.src.id}|${edge.src.title}]]
- **${t.relFileTarget}:** [[${edge.tgt.id}|${edge.tgt.title}]]

## ${t.relFileReason}
${descText}
${graphBackend === "sqlite" ? "" : buildMemgraphCypherSection(edge, description)}`;
}

function buildMemgraphCypherSection(edge: ResolvedRelationEdge, description: string): string {
  const cypherText = buildRelationCypherPreview([edge], description);
  return `

## Cypher (Memgraph)
Wird automatisch mit Memgraph synchronisiert (falls verbunden). Zum manuellen Ausführen in Memgraph Lab:

\`\`\`cypher
${cypherText}
\`\`\`
`;
}
