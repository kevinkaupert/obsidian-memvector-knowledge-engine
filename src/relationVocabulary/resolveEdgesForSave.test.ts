/**
 * Purpose: Characterization of edit-direction handling in resolveEdgesForSave for a batch (#129).
 */
import { describe, expect, it } from "vitest";
import { resolveEdgesForSave } from "./resolveTerm";
import type { RelationTermDef } from "./types";

const defs: RelationTermDef[] = [
  { key: "relDerivedFrom", label: "DERIVED_FROM", term: "is derived from", category: "x", bidirectional: false, reversed: true },
] as RelationTermDef[];

describe("resolveEdgesForSave in a batch", () => {
  it("only the first edge keeps its direction when the edited reversed label is unchanged", () => {
    const edges = [{ src: "a", tgt: "b" }, { src: "c", tgt: "d" }];
    const resolved = resolveEdgesForSave(defs, edges as never, { 0: "DERIVED_FROM", 1: "DERIVED_FROM" }, "", "DERIVED_FROM");
    expect(resolved.map((e) => [e.src, e.tgt])).toEqual([["a", "b"], ["d", "c"]]);
  });

  it("without an edited label every reversed edge is swapped", () => {
    const edges = [{ src: "a", tgt: "b" }, { src: "c", tgt: "d" }];
    const resolved = resolveEdgesForSave(defs, edges as never, { 0: "DERIVED_FROM", 1: "DERIVED_FROM" }, "");
    expect(resolved.map((e) => [e.src, e.tgt])).toEqual([["b", "a"], ["d", "c"]]);
  });
});
