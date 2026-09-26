import type { RelationEdgeDraft, RelationNode } from "../modals/relationBuilder/relationEdgeBuilder";
import type { RelationTermDef } from "./types";

/**
 * Purpose: Sanitizes user-entered custom relation string to standard uppercase Cypher label format.
 */
export function sanitizeRelType(rel: string): string {
  const cleaned = (rel || "REQUIRES").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "REQUIRES";
}

/**
 * Purpose: Looks up definition by stable term key.
 * [WARN] [TODO] Preserved for Issue #43 fine-grained conversational phrase resolution.
 */
export function resolveRelationTerm(defs: RelationTermDef[], termKey: string): RelationTermDef | null {
  return defs.find((d) => d.key === termKey) ?? null;
}

/**
 * Purpose: Pre-selects dropdown option when editing an existing edge that has a stored canonical label or legacy key.
 * Always resolves to the canonical Cypher label if matched, avoiding legacy key persistence.
 */
export function defaultTermForLabel(defs: RelationTermDef[], label: string): string | null {
  const upper = (label || "").toUpperCase();
  const canonicalMatch = defs.find((d) => d.label.toUpperCase() === upper);
  if (canonicalMatch) return canonicalMatch.label;
  return defs.find((d) => d.key.toUpperCase() === upper)?.label ?? null;
}

export interface ResolvedRelationEdge {
  src: RelationNode;
  tgt: RelationNode;
  label: string;
  bidirectional: boolean;
  originalTerm: string;
}

/**
 * Purpose: Resolves draft edges to their final Cypher label and directionality.
 * Always saves canonical Cypher labels. When editing an existing edge, resolves the initial relation
 * to its canonical label so direction is never mistakenly inverted on unchanged saves (Issue #108).
 */
export function resolveEdgesForSave(
  defs: RelationTermDef[],
  edges: RelationEdgeDraft[],
  edgeRelTypes: Record<number, string>,
  customType: string,
  editedCanonicalLabel?: string
): ResolvedRelationEdge[] {
  const upperEdited = (editedCanonicalLabel || "").toUpperCase();
  const canonicalEdited = upperEdited
    ? (defs.find((d) => d.label.toUpperCase() === upperEdited || d.key.toUpperCase() === upperEdited)?.label || editedCanonicalLabel)
    : undefined;

  return edges.map((e, idx) => {
    const termKey = edgeRelTypes[idx] || customType;
    const termDef = termKey && termKey !== "CUSTOM" ? resolveRelationTerm(defs, termKey) : null;
    const canonicalDef = !termDef && termKey && termKey !== "CUSTOM" ? defs.find((d) => d.label === termKey) : null;
    const def = termDef || canonicalDef;

    if (!def) {
      const label = sanitizeRelType(termKey === "CUSTOM" || !termKey ? customType : termKey);
      return { src: e.src, tgt: e.tgt, label, bidirectional: false, originalTerm: customType || label };
    }

    const retainsEditedDirection = idx === 0 && Boolean(canonicalEdited) && def.label === canonicalEdited;
    return def.reversed && !retainsEditedDirection
      ? { src: e.tgt, tgt: e.src, label: def.label, bidirectional: def.bidirectional, originalTerm: def.label }
      : { src: e.src, tgt: e.tgt, label: def.label, bidirectional: def.bidirectional, originalTerm: def.label };
  });
}
