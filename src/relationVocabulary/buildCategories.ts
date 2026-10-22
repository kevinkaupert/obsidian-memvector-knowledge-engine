import type { RelationTermDef } from "./types";

export interface RelationTypeOption {
  val: string;
  label: string;
}

export interface RelationCategory {
  name: string;
  items: RelationTypeOption[];
}

/**
 * Purpose: Groups canonical Cypher relation labels by category for 1:1 dropdown selection without lossy remapping.
 * Deprecated terms are not offered for new relations (knowOS relation-vocabulary contract); `keepLabel` keeps the
 * label of the relation being edited, so editing an existing deprecated relation still shows its type.
 */
export function buildRelationCategories(defs: RelationTermDef[], _customLabel?: string, keepLabel?: string): RelationCategory[] {
  const order: string[] = [];
  const byCategory = new Map<string, RelationTypeOption[]>();
  const seenLabels = new Set<string>();

  for (const def of defs) {
    if (def.deprecated && def.label !== keepLabel) continue;
    if (seenLabels.has(def.label)) continue;
    seenLabels.add(def.label);

    if (!byCategory.has(def.category)) {
      byCategory.set(def.category, []);
      order.push(def.category);
    }
    byCategory.get(def.category)!.push({ val: def.label, label: def.label });
  }

  return order.map((name) => ({ name, items: byCategory.get(name)! }));
}

