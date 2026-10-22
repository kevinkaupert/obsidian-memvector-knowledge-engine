import { describe, expect, it } from "vitest";
import { assignCanvasSlot, setDeprecated } from "./canvasSlotEdits";
import type { RelationTermDef } from "./types";

const t = (key: string, label: string, extra: Partial<RelationTermDef> = {}): RelationTermDef =>
  ({ key, label, term: key, category: "C", bidirectional: false, reversed: false, ...extra });

describe("canvas slot edits in the type table (knowOS ADR-0011)", () => {
  it("puts the slot on the label's first term and removes it from its synonyms", () => {
    const terms = [t("a", "AUSNAHME"), t("a2", "AUSNAHME", { canvas: { slot: "N", subject: "source" } }), t("b", "B")];
    const edit = assignCanvasSlot(terms, "ausnahme", "W-down", "new");
    expect("terms" in edit && edit.terms.map((x) => x.canvas)).toEqual([{ slot: "W-down", subject: "new" }, undefined, undefined]);
  });

  it("refuses a slot another label holds, and frees a slot with null", () => {
    const terms = [t("r", "REQUIRES", { canvas: { slot: "N", subject: "source" } }), t("s", "SETZT_VORAUS")];
    expect(assignCanvasSlot(terms, "SETZT_VORAUS", "N", "source")).toEqual({ takenBy: "REQUIRES" });
    const freed = assignCanvasSlot(terms, "REQUIRES", null, "source");
    expect("terms" in freed && freed.terms[0].canvas).toBeUndefined();
    const moved = assignCanvasSlot("terms" in freed ? freed.terms : [], "SETZT_VORAUS", "N", "source");
    expect("terms" in moved && moved.terms[1].canvas).toEqual({ slot: "N", subject: "source" });
  });

  it("changing only the subject keeps the slot on the same label", () => {
    const terms = [t("e", "EXAMPLE_OF", { canvas: { slot: "E-down", subject: "new" } })];
    const edit = assignCanvasSlot(terms, "EXAMPLE_OF", "E-down", "source");
    expect("terms" in edit && edit.terms[0].canvas).toEqual({ slot: "E-down", subject: "source" });
  });

  it("deprecating frees the slot; undeprecating removes the flag but gives no slot back", () => {
    const terms = [t("v", "VERWEIS", { canvas: { slot: "E-up", subject: "new" } }), t("v2", "VERWEIS")];
    const dep = setDeprecated(terms, "VERWEIS", true);
    expect(dep.freedSlot).toBe("E-up");
    expect(dep.terms.every((x) => x.deprecated === true && !x.canvas)).toBe(true);
    const back = setDeprecated(dep.terms, "VERWEIS", false);
    expect(back.terms.every((x) => x.deprecated === undefined && !x.canvas)).toBe(true);
  });

  it("a deprecated term does not take a slot", () => {
    const edit = assignCanvasSlot([t("v", "VERWEIS", { deprecated: true })], "VERWEIS", "N", "source");
    expect("terms" in edit && edit.terms[0].canvas).toBeUndefined();
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
