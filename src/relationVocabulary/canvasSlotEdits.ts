import type { CanvasSlot, CanvasSlotId, RelationTermDef } from "./types";

/** The six canvas slots in table order (knowOS relation-vocabulary contract section 3). */
export const CANVAS_SLOT_IDS: CanvasSlotId[] = ["N", "S", "E-up", "E-down", "W-up", "W-down"];

export type SlotEdit = { terms: RelationTermDef[] } | { takenBy: string };

function withoutCanvas(term: RelationTermDef): RelationTermDef {
  if (!term.canvas) return term;
  const { canvas: _canvas, ...rest } = term;
  return rest;
}

/**
 * Purpose: Gives a label's term a canvas slot (or removes it with `slot: null`), as the type table edits it.
 * Architecture: The table shows one row per label; the slot goes to the label's first term and is removed from its
 * synonyms, so the preset never holds a label twice on the canvas. A slot used by another label is refused
 * (`takenBy`) instead of moved: the contract allows each slot once, and silently taking it from the other type
 * would change its canvas handle without the user seeing it.
 */
export function assignCanvasSlot(terms: RelationTermDef[], label: string, slot: CanvasSlotId | null, subject: CanvasSlot["subject"]): SlotEdit {
  const key = label.toUpperCase();
  if (slot) {
    const holder = terms.find((t) => t.canvas?.slot === slot && t.label.toUpperCase() !== key);
    if (holder) return { takenBy: holder.label };
  }
  let placed = false;
  return {
    terms: terms.map((t) => {
      if (t.label.toUpperCase() !== key) return t;
      if (!slot || placed || t.deprecated) return withoutCanvas(t);
      placed = true;
      return { ...t, canvas: { slot, subject } };
    }),
  };
}

/**
 * Purpose: Marks every term of a label as deprecated (or not); a deprecated term gives up its canvas slot, as the
 * contract requires. Returns the freed slot so the user can be told.
 */
export function setDeprecated(terms: RelationTermDef[], label: string, deprecated: boolean): { terms: RelationTermDef[]; freedSlot: CanvasSlotId | null } {
  const key = label.toUpperCase();
  let freedSlot: CanvasSlotId | null = null;
  const next = terms.map((t) => {
    if (t.label.toUpperCase() !== key) return t;
    if (!deprecated) {
      const { deprecated: _d, ...rest } = t;
      return rest;
    }
    if (t.canvas) freedSlot = t.canvas.slot;
    return { ...withoutCanvas(t), deprecated: true };
  });
  return { terms: next, freedSlot };
}
