/**
 * Purpose: Edit-direction handling of resolveEdgesForSave in a batch: only the edge at editedEdgeIndex keeps it (#129).
 */
import { describe, expect, it } from "vitest";
import { resolveEdgesForSave } from "./resolveTerm";
import type { RelationTermDef } from "./types";

const defs: RelationTermDef[] = [
  { key: "relDerivedFrom", label: "DERIVED_FROM", term: "is derived from", category: "x", bidirectional: false, reversed: true },
] as RelationTermDef[];

describe("resolveEdgesForSave in a batch", () => {
  const edges = [{ src: "a", tgt: "b" }, { src: "c", tgt: "d" }];
  const types = { 0: "DERIVED_FROM", 1: "DERIVED_FROM" };
  const pairs = (index?: number) => resolveEdgesForSave(defs, edges as never, types, "", "DERIVED_FROM", index).map((e) => [e.src, e.tgt]);

  it("only the edited edge keeps its direction when the edited reversed label is unchanged (#129)", () => {
    expect(pairs(0)).toEqual([["a", "b"], ["d", "c"]]);
    expect(pairs(1)).toEqual([["b", "a"], ["c", "d"]]);
  });

  it("without an edited index no edge keeps its direction", () => {
    expect(pairs(undefined)).toEqual([["b", "a"], ["d", "c"]]);
  });

  it("without an edited label every reversed edge is swapped", () => {
    const edges = [{ src: "a", tgt: "b" }, { src: "c", tgt: "d" }];
    const resolved = resolveEdgesForSave(defs, edges as never, { 0: "DERIVED_FROM", 1: "DERIVED_FROM" }, "");
    expect(resolved.map((e) => [e.src, e.tgt])).toEqual([["b", "a"], ["d", "c"]]);
  });
});
