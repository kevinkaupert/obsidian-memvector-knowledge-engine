import type { RelationEdgeDraft, RelationNode } from "../modals/relationBuilder/relationEdgeBuilder";
import type { RelationTermDef } from "./types";

export function sanitizeRelType(rel: string): string {
  const cleaned = (rel || "REQUIRES").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "REQUIRES";
}

export function resolveRelationTerm(defs: RelationTermDef[], termKey: string): RelationTermDef | null {
  return defs.find((d) => d.key === termKey) ?? null;
}

/** For pre-selecting a dropdown option when editing an existing edge that only has the stored canonical label - picks the first term that maps to it, or null if the label isn't in the current vocabulary (RelationBuilderModal falls back to the free-text "Custom" field in that case). */
export function defaultTermForLabel(defs: RelationTermDef[], label: string): string | null {
  const upper = (label || "").toUpperCase();
  return defs.find((d) => d.label === upper)?.key ?? null;
}

export interface ResolvedRelationEdge {
  src: RelationNode;
  tgt: RelationNode;
  label: string;
  bidirectional: boolean;
  originalTerm: string;
}

/**
 * Resolves each draft edge's chosen dropdown value (a vocabulary term key, or
 * "CUSTOM") into its final Cypher label, bidirectional flag, and display term -
 * swapping src/tgt for terms whose natural reading reverses direction (e.g.
 * "follows from"). Shared by the cypher preview and the actual save, so they
 * can never disagree.
 */
export function resolveEdgesForSave(
  defs: RelationTermDef[],
  edges: RelationEdgeDraft[],
  edgeRelTypes: Record<number, string>,
  customType: string
): ResolvedRelationEdge[] {
  return edges.map((e, idx) => {
    const termKey = edgeRelTypes[idx];
    const def = termKey && termKey !== "CUSTOM" ? resolveRelationTerm(defs, termKey) : null;

    if (!def) {
      const label = sanitizeRelType(termKey === "CUSTOM" || !termKey ? customType : termKey);
      return { src: e.src, tgt: e.tgt, label, bidirectional: false, originalTerm: customType || label };
    }

    return def.reversed
      ? { src: e.tgt, tgt: e.src, label: def.label, bidirectional: def.bidirectional, originalTerm: def.term }
      : { src: e.src, tgt: e.tgt, label: def.label, bidirectional: def.bidirectional, originalTerm: def.term };
  });
}
