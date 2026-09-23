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
 * Purpose: Pre-selects dropdown option when editing an existing edge that has a stored canonical label.
 * Resolves directly to the canonical label if present in defs, or falls back to key lookup.
 */
export function defaultTermForLabel(defs: RelationTermDef[], label: string): string | null {
  const upper = (label || "").toUpperCase();
  const canonicalMatch = defs.find((d) => d.label === upper);
  if (canonicalMatch) return canonicalMatch.label;
  return defs.find((d) => d.key === label)?.key ?? null;
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
 * Handles direct canonical labels (e.g. "IMPLIES") as well as legacy/conversational keys (e.g. "relImplies").
 */
export function resolveEdgesForSave(
  defs: RelationTermDef[],
  edges: RelationEdgeDraft[],
  edgeRelTypes: Record<number, string>,
  customType: string
): ResolvedRelationEdge[] {
  return edges.map((e, idx) => {
    const termKey = edgeRelTypes[idx];
    const termDef = termKey && termKey !== "CUSTOM" ? resolveRelationTerm(defs, termKey) : null;
    const canonicalDef = !termDef && termKey && termKey !== "CUSTOM" ? defs.find((d) => d.label === termKey) : null;
    const def = termDef || canonicalDef;

    if (!def) {
      const label = sanitizeRelType(termKey === "CUSTOM" || !termKey ? customType : termKey);
      return { src: e.src, tgt: e.tgt, label, bidirectional: false, originalTerm: customType || label };
    }

    const originalTerm = termDef ? termDef.term : def.label;
    return def.reversed
      ? { src: e.tgt, tgt: e.src, label: def.label, bidirectional: def.bidirectional, originalTerm }
      : { src: e.src, tgt: e.tgt, label: def.label, bidirectional: def.bidirectional, originalTerm };
  });
}

