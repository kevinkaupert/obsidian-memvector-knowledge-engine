import { describe, expect, it } from "vitest";
import { applyLayoutEdit, bundledLayoutForLabel, withBundledLayoutDefaults } from "./layoutDefaults";
import type { RelationTermDef } from "./types";

/** Exactly what a vault seeded by 0.1.0-0.1.6 has on disk: no weight/repels fields at all. */
const LEGACY_TERMS: RelationTermDef[] = [
  { key: "relConflictsWith", label: "CONFLICTS_WITH", term: "contradicts", category: "Logic", bidirectional: true, reversed: false },
  { key: "relIndependentOf", label: "INDEPENDENT_OF", term: "is independent of", category: "Logic", bidirectional: true, reversed: false },
  { key: "relEquivalentTo", label: "EQUIVALENT_TO", term: "equivalent to", category: "Logic", bidirectional: true, reversed: false },
  { key: "relAnalogousTo", label: "ANALOGOUS_TO", term: "is analogous to", category: "Structure", bidirectional: true, reversed: false },
  { key: "relImplies", label: "IMPLIES", term: "implies", category: "Logic", bidirectional: false, reversed: false },
];

describe("withBundledLayoutDefaults (upgrade path for pre-0.1.7 vocabulary files)", () => {
  it("restores repulsion and the special weights a legacy file cannot carry", () => {
    const filled = withBundledLayoutDefaults(LEGACY_TERMS);
    const byLabel = new Map(filled.map((t) => [t.label, t]));

    expect(byLabel.get("CONFLICTS_WITH")?.repels).toBe(true);
    expect(byLabel.get("INDEPENDENT_OF")?.weight).toBe(0.05);
    expect(byLabel.get("EQUIVALENT_TO")?.weight).toBe(1.3);
    expect(byLabel.get("ANALOGOUS_TO")?.weight).toBe(1.1);
  });

  it("leaves a label with no bundled layout semantics untouched", () => {
    const filled = withBundledLayoutDefaults(LEGACY_TERMS);
    const implies = filled.find((t) => t.label === "IMPLIES");
    expect(implies?.weight).toBeUndefined();
    expect(implies?.repels).toBeUndefined();
  });

  it("preserves every non-layout field, including a vault's own term wording", () => {
    const filled = withBundledLayoutDefaults(LEGACY_TERMS);
    const conflicts = filled.find((t) => t.label === "CONFLICTS_WITH");
    expect(conflicts).toMatchObject({ key: "relConflictsWith", term: "contradicts", category: "Logic", bidirectional: true, reversed: false });
  });

  it("an explicit weight wins over the bundled default (deliberate override)", () => {
    const overridden: RelationTermDef[] = [
      { key: "x", label: "CONFLICTS_WITH", term: "conflicts with", category: "Logic", bidirectional: true, reversed: false, weight: 2 },
    ];
    const filled = withBundledLayoutDefaults(overridden);
    expect(filled[0].weight).toBe(2);
    // repels is intentionally NOT re-added: the vault opted this label into plain attraction.
    expect(filled[0].repels).toBeUndefined();
  });

  it("an explicit repels: false wins over the bundled default", () => {
    const neutralized: RelationTermDef[] = [
      { key: "x", label: "CONFLICTS_WITH", term: "conflicts with", category: "Logic", bidirectional: true, reversed: false, repels: false },
    ];
    expect(withBundledLayoutDefaults(neutralized)[0].repels).toBe(false);
  });

  it("does not invent semantics for a custom label the plugin does not ship", () => {
    const custom: RelationTermDef[] = [
      { key: "customX", label: "IS_HOMOMORPHIC_TO", term: "is homomorphic to", category: "Custom", bidirectional: true, reversed: false },
    ];
    const filled = withBundledLayoutDefaults(custom);
    expect(filled[0].weight).toBeUndefined();
    expect(bundledLayoutForLabel("IS_HOMOMORPHIC_TO")).toBeUndefined();
  });

  it("matches labels case-insensitively", () => {
    expect(bundledLayoutForLabel("conflicts_with")?.repels).toBe(true);
  });
});

describe("applyLayoutEdit (Settings round-trip)", () => {
  const conflicts: RelationTermDef = { key: "relConflictsWith", label: "CONFLICTS_WITH", term: "conflicts with", category: "Logic", bidirectional: true, reversed: false, repels: true };
  const implies: RelationTermDef = { key: "relImplies", label: "IMPLIES", term: "implies", category: "Logic", bidirectional: false, reversed: false };
  const custom: RelationTermDef = { key: "customX", label: "IS_HOMOMORPHIC_TO", term: "is homomorphic to", category: "Custom", bidirectional: true, reversed: false };

  /** What the vocabulary file round-trips to: write, then read it back through the loader. */
  const roundTrip = (term: RelationTermDef) => withBundledLayoutDefaults([term])[0];

  it("writes repels: false explicitly so unticking a bundled repeller sticks", () => {
    const edited = applyLayoutEdit(conflicts, { weight: 1, repels: false });
    expect(edited.repels).toBe(false);
    // The whole point: omitting the field here would restore the bundled repels: true.
    expect(roundTrip(edited).repels).toBe(false);
  });

  it("writes weight 1.0 explicitly when the bundled default is not 1.0", () => {
    const equivalent: RelationTermDef = { key: "k", label: "EQUIVALENT_TO", term: "is equivalent to", category: "Logic", bidirectional: true, reversed: false, weight: 1.3 };
    const edited = applyLayoutEdit(equivalent, { weight: 1, repels: false });
    expect(edited.weight).toBe(1);
    expect(roundTrip(edited).weight).toBe(1);
  });

  it("omits both fields when the edit matches the bundled pair", () => {
    const edited = applyLayoutEdit(conflicts, { weight: 1, repels: true });
    expect(edited.weight).toBeUndefined();
    expect(edited.repels).toBeUndefined();
    // The fallback reproduces it, so the file stays clean without lying.
    expect(roundTrip(edited).repels).toBe(true);
  });

  it("omits both fields for a plain 1.0 / no-repel label with no bundled semantics", () => {
    expect(applyLayoutEdit(implies, { weight: 1, repels: false })).toEqual(implies);
    expect(applyLayoutEdit(custom, { weight: 1, repels: false })).toEqual(custom);
  });

  it("persists a custom label's edited values, which have no fallback to lean on", () => {
    const edited = applyLayoutEdit(custom, { weight: 2.5, repels: true });
    expect(edited).toMatchObject({ weight: 2.5, repels: true });
    expect(roundTrip(edited)).toMatchObject({ weight: 2.5, repels: true });
  });

  it("keeps every non-layout field untouched", () => {
    const edited = applyLayoutEdit(conflicts, { weight: 0.4, repels: false });
    expect(edited).toMatchObject({ key: "relConflictsWith", term: "conflicts with", category: "Logic", bidirectional: true, reversed: false });
  });

  it("round-trips an arbitrary edit exactly", () => {
    for (const [w, r] of [[0, false], [0.05, true], [1, true], [1.3, false], [3, true]] as [number, boolean][]) {
      const back = roundTrip(applyLayoutEdit(conflicts, { weight: w, repels: r }));
      expect([back.weight ?? 1, back.repels ?? false]).toEqual([w, r]);
    }
  });
});
