import { describe, expect, it } from "vitest";
import { labelOnSlot, placeOnSlot, setDeprecated, slotOfLabel } from "./canvasSlotEdits";
import { CANVAS_SLOTS, canvasSlotTitle } from "./canvasSlots";
import type { RelationTermDef } from "./types";

const t = (key: string, label: string, extra: Partial<RelationTermDef> = {}): RelationTermDef =>
  ({ key, label, term: key, category: "C", bidirectional: false, reversed: false, ...extra });

describe("canvas slots (knowOS ADR-0011)", () => {
  it("lists the six slots of contract version 1 in a 2-row compass without overlaps", () => {
    expect(CANVAS_SLOTS.map((s) => s.id)).toEqual(["N", "S", "E-up", "E-down", "W-up", "W-down"]);
    expect(new Set(CANVAS_SLOTS.map((s) => `${s.row}/${s.col}`)).size).toBe(6);
    expect(canvasSlotTitle("E-down", "de")).toBe("O ↘ Beispiel");
    expect(canvasSlotTitle("E-down", "en")).toBe("E ↘ example");
    expect(canvasSlotTitle("NE", "de")).toBe("NE");
  });

  it("placing a label takes the slot from its holder and moves the label off its old slot", () => {
    const terms = [t("r", "REQUIRES", { canvas: { slot: "N", subject: "source" } }), t("e", "EQUIVALENT_TO", { canvas: { slot: "S", subject: "new" } })];
    const next = placeOnSlot(terms, "N", "EQUIVALENT_TO", "source");
    expect(next.map((x) => x.canvas)).toEqual([undefined, { slot: "N", subject: "source" }]);
    expect(slotOfLabel(next, "equivalent_to")).toBe("N");
    expect(labelOnSlot(next, "S")).toBeNull();
  });

  it("puts the slot on the label's first non-deprecated term only, and empties it with null", () => {
    const terms = [t("a0", "AUSNAHME", { deprecated: true }), t("a", "AUSNAHME"), t("a2", "AUSNAHME")];
    const next = placeOnSlot(terms, "W-down", "AUSNAHME", "new");
    expect(next.map((x) => x.canvas?.slot)).toEqual([undefined, "W-down", undefined]);
    expect(placeOnSlot(next, "W-down", null, "new").every((x) => !x.canvas)).toBe(true);
  });

  it("keeps slots it does not know (newer contract)", () => {
    const terms = [t("d", "DIAGONAL", { canvas: { slot: "NE", subject: "new" } }), t("r", "REQUIRES")];
    expect(placeOnSlot(terms, "N", "REQUIRES", "source")[0].canvas).toEqual({ slot: "NE", subject: "new" });
  });

  it("deprecating frees the slot; undeprecating removes the flag but gives no slot back", () => {
    const terms = [t("v", "VERWEIS", { canvas: { slot: "E-up", subject: "new" } }), t("v2", "VERWEIS")];
    const dep = setDeprecated(terms, "VERWEIS", true);
    expect(dep.freedSlot).toBe("E-up");
    expect(dep.terms.every((x) => x.deprecated === true && !x.canvas)).toBe(true);
    const back = setDeprecated(dep.terms, "VERWEIS", false);
    expect(back.terms.every((x) => x.deprecated === undefined && !x.canvas)).toBe(true);
  });
});

describe("deprecated terms in the relation builder", () => {
  it("are not offered for new relations, but the edited relation keeps its type", async () => {
    const { buildRelationCategories } = await import("./buildCategories");
    const defs = [t("a", "AKTUELL"), t("v", "VERWEIS", { deprecated: true })];
    const labels = (cats: ReturnType<typeof buildRelationCategories>) => cats.flatMap((c) => c.items.map((i) => i.val));
    expect(labels(buildRelationCategories(defs))).toEqual(["AKTUELL"]);
    expect(labels(buildRelationCategories(defs, undefined, "VERWEIS"))).toEqual(["AKTUELL", "VERWEIS"]);
  });
});
