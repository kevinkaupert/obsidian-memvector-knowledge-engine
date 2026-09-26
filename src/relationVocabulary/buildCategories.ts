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
 */
export function buildRelationCategories(defs: RelationTermDef[], customLabel: string): RelationCategory[] {
  const order: string[] = [];
  const byCategory = new Map<string, RelationTypeOption[]>();
  const seenLabels = new Set<string>();

  for (const def of defs) {
    if (seenLabels.has(def.label)) continue;
    seenLabels.add(def.label);

    if (!byCategory.has(def.category)) {
      byCategory.set(def.category, []);
      order.push(def.category);
    }
    byCategory.get(def.category)!.push({ val: def.label, label: def.label });
  }

  const categories = order.map((name) => ({ name, items: byCategory.get(name)! }));
  categories.push({ name: customLabel, items: [{ val: "CUSTOM", label: customLabel }] });
  return categories;
}

