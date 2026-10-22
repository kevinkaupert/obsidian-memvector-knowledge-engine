import type { CanvasSlot, CanvasSlotId, RelationTermDef } from "./types";

function withoutCanvas(term: RelationTermDef): RelationTermDef {
  if (!term.canvas) return term;
  const { canvas: _canvas, ...rest } = term;
  return rest;
}

/** The slot a label's terms hold, if any (the table shows one row per label). */
export function slotOfLabel(terms: RelationTermDef[], label: string): CanvasSlotId | null {
  const key = label.toUpperCase();
  return terms.find((t) => t.label.toUpperCase() === key && t.canvas)?.canvas?.slot ?? null;
}

/** The label holding a slot, if any. */
export function labelOnSlot(terms: RelationTermDef[], slot: CanvasSlotId): string | null {
  return terms.find((t) => t.canvas?.slot === slot)?.label ?? null;
}

/**
 * Purpose: Puts a label on a slot (or empties the slot with `label: null`), as the canvas handles section edits it.
 * Architecture: Thought from the slot: whoever held the slot gives it up; the chosen label leaves any other slot it
 * held (it moves; the caller asks the user first) and the slot goes to the label's first non-deprecated term, so a
 * label is never on two handles and a slot never holds two labels. A deprecated-only label takes no slot.
 */
export function placeOnSlot(terms: RelationTermDef[], slot: CanvasSlotId, label: string | null, subject: CanvasSlot["subject"]): RelationTermDef[] {
  const key = label?.toUpperCase() ?? null;
  let placed = false;
  return terms.map((t) => {
    const ofLabel = key !== null && t.label.toUpperCase() === key;
    if (!ofLabel) return t.canvas?.slot === slot ? withoutCanvas(t) : t;
    if (placed || t.deprecated) return withoutCanvas(t);
    placed = true;
    return { ...t, canvas: { slot, subject } };
  });
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
