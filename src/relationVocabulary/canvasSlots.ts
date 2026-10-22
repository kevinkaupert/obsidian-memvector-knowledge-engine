/**
 * Purpose: The canvas slots (direction handles of Canvas Tutor), as listed by the knowOS relation-vocabulary contract.
 * Architecture: A copy of knowOS `docs/contracts/relation-vocabulary-slots.json` (version 1); knowOS checks that the
 * two agree. Every slot picker is built from this list, so a new direction is one more entry here, not new UI code.
 * Slot ids not in this list (from a newer contract) are kept in the files and shown as unknown.
 */
export interface CanvasSlotDef {
  id: string;
  /** Place in the 2-row compass of the settings: row 0 upper, row 1 lower; col 0 left (W), 1 middle, 2 right (E). */
  row: number;
  col: number;
  /** Short sign shown next to a type that holds the slot. */
  short: string;
  de: string;
  en: string;
}

export const CANVAS_SLOTS_VERSION = 1;

export const CANVAS_SLOTS: CanvasSlotDef[] = [
  { id: "N", row: 0, col: 1, short: "↑", de: "Grundlage", en: "ground" },
  { id: "S", row: 1, col: 1, short: "↓", de: "Folge", en: "consequence" },
  { id: "E-up", row: 0, col: 2, short: "↗", de: "allgemeiner", en: "more general" },
  { id: "E-down", row: 1, col: 2, short: "↘", de: "Beispiel", en: "example" },
  { id: "W-up", row: 0, col: 0, short: "↖", de: "warum so", en: "why so" },
  { id: "W-down", row: 1, col: 0, short: "↙", de: "warum nicht", en: "why not" },
];

export function canvasSlot(id: string): CanvasSlotDef | undefined {
  return CANVAS_SLOTS.find((s) => s.id === id);
}

/** "N ↑ Grundlage" in the settings language; an unknown id is shown as it is. */
export function canvasSlotTitle(id: string, language: string): string {
  const def = canvasSlot(id);
  if (!def) return id;
  const side = def.id.replace(/-(up|down)$/, "");
  const letter = language === "de" && side === "E" ? "O" : side; // Ost
  return `${letter} ${def.short} ${language === "de" ? def.de : def.en}`;
}
