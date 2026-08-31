import type { RelationTermDef } from "./types";

export interface RelationTypeOption {
  val: string;
  label: string;
}

export interface RelationCategory {
  name: string;
  items: RelationTypeOption[];
}

/** Groups the loaded vocabulary's terms by their own `category` field (whatever the vault's vocabulary file defines) and appends a "Custom" fallback category, in the order categories first appear in the file. */
export function buildRelationCategories(defs: RelationTermDef[], customLabel: string): RelationCategory[] {
  const order: string[] = [];
  const byCategory = new Map<string, RelationTypeOption[]>();

  for (const def of defs) {
    if (!byCategory.has(def.category)) {
      byCategory.set(def.category, []);
      order.push(def.category);
    }
    byCategory.get(def.category)!.push({ val: def.key, label: def.term });
  }

  const categories = order.map((name) => ({ name, items: byCategory.get(name)! }));
  categories.push({ name: customLabel, items: [{ val: "CUSTOM", label: customLabel }] });
  return categories;
}
