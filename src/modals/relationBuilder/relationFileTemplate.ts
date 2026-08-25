import type { TranslationKeys } from "../../i18n";
import type { RelationEdgeDraft } from "./relationEdgeBuilder";

export function relationFilePath(edge: RelationEdgeDraft): string {
  return `wiki/relations/rel-${edge.src.id}-to-${edge.tgt.id}.md`;
}

export function buildRelationFileContent(edge: RelationEdgeDraft, edgeType: string, description: string, t: TranslationKeys): string {
  const descText = description || `${t.relDefaultDesc} ${edgeType} ${t.relBetween} [[${edge.src.id}|${edge.src.title}]] ${t.relAnd} [[${edge.tgt.id}|${edge.tgt.title}]].`;

  return `---
type: relation
title: "${edge.src.title} ➔ ${edge.tgt.title} (${edgeType})"
description: "${descText.replace(/"/g, '\\"')}"
status: draft
sources:
  - "${edge.src.path}"
  - "${edge.tgt.path}"
generated:
  by: "MemVector Co-Pilot"
  at: "${new Date().toISOString()}"
verified: null
relation_type: "${edgeType}"
source_note: "[[${edge.src.id}|${edge.src.title}]]"
target_note: "[[${edge.tgt.id}|${edge.tgt.title}]]"
---

# ${t.relFileHeading}: [[${edge.src.id}|${edge.src.title}]] ➤ [[${edge.tgt.id}|${edge.tgt.title}]]

- **${t.relFileType}:** \`${edgeType}\`
- **${t.relFileSource}:** [[${edge.src.id}|${edge.src.title}]]
- **${t.relFileTarget}:** [[${edge.tgt.id}|${edge.tgt.title}]]

## ${t.relFileReason}
${descText}
`;
}
