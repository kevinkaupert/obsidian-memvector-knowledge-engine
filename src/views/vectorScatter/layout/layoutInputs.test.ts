import { describe, expect, it } from "vitest";
import type { RelationEdge, ScatterNode } from "../types";
import type { RelationTermDef } from "../../../relationVocabulary/types";
import { captureLayoutSnapshot, diffLayoutSnapshots, isLayoutUnchanged, type LayoutSettingsInputs } from "./layoutInputs";
import { DEFAULT_LAYOUT_WEIGHTS } from "./signals";

function node(id: string, overrides: Partial<ScatterNode> = {}): ScatterNode {
  return {
    id,
    basenameKey: id.toLowerCase(),
    title: id,
    type: "concept",
    path: `topic/${id}.md`,
    x: 10,
    y: 20,
    latexFormulas: ["a^2"],
    links: ["other"],
    content: "alpha beta gamma",
    embedding: [0.1, 0.2, 0.3],
    ...overrides,
  };
}

const settings: LayoutSettingsInputs = { weights: DEFAULT_LAYOUT_WEIGHTS, links: new Map([["topic/A.md", ["topic/B.md"]]]) };
const edge = (relType = "REQUIRES", src = "A", tgt = "B"): RelationEdge => ({ srcId: src, tgtId: tgt, relType, desc: "why", title: "", path: "wiki/relations/r.md", bidirectional: false });
const vocab: RelationTermDef[] = [{ label: "REQUIRES", weight: 1 } as RelationTermDef, { label: "CONFLICTS_WITH", repels: true } as RelationTermDef];

function diffAfter(change: (nodes: ScatterNode[], edges: RelationEdge[]) => { nodes?: ScatterNode[]; edges?: RelationEdge[]; settings?: LayoutSettingsInputs; vocabulary?: RelationTermDef[] }) {
  const nodes = [node("A"), node("B")];
  const edges = [edge()];
  const before = captureLayoutSnapshot(nodes, edges, vocab, settings);
  const c = change(
    nodes.map((n) => ({ ...n })),
    edges.map((e) => ({ ...e }))
  );
  const after = captureLayoutSnapshot(c.nodes ?? nodes, c.edges ?? edges, c.vocabulary ?? vocab, c.settings ?? settings);
  return diffLayoutSnapshots(before, after);
}

describe("layout-input signatures (#209)", () => {
  it("reports no change for fresh node objects with identical inputs", () => {
    expect(isLayoutUnchanged(diffAfter((nodes) => ({ nodes })))).toBe(true);
  });

  it.each<[string, (n: ScatterNode) => void]>([
    ["vector", (n) => (n.embedding = [0.1, 0.2, 0.31])],
    ["vector removed", (n) => (n.embedding = undefined)],
  ])("marks a node as changed when its %s change", (_label, mutate) => {
    const diff = diffAfter((nodes) => {
      mutate(nodes[0]);
      return { nodes };
    });
    expect([...diff.changedIds]).toEqual(["A"]);
  });

  it("marks a node as changed when its resolved WikiLinks change (Plan 0005: the link signal's only source)", () => {
    const diff = diffAfter(() => ({ settings: { ...settings, links: new Map([["topic/A.md", ["topic/B.md", "topic/C.md"]]]) } }));
    expect([...diff.changedIds]).toEqual(["A"]);
  });

  it.each<[string, (n: ScatterNode) => void]>([
    ["title", (n) => (n.title = "Renamed title")],
    ["type", (n) => (n.type = "theorem")],
    ["position", (n) => ((n.x = 999), (n.y = -5))],
    ["excerpt words", (n) => (n.content = "alpha beta delta")],
    ["regex links in the body", (n) => (n.links = ["other", "late-link"])],
    ["folder", (n) => (n.path = "elsewhere/A.md")],
    ["formulas", (n) => (n.latexFormulas = ["x"])],
  ])("does not treat a %s change as a layout change (Plan 0005: no signal reads it)", (_label, mutate) => {
    const diff = diffAfter((nodes) => {
      mutate(nodes[0]);
      return { nodes };
    });
    // A moved path also moves the resolved-link key; only the content-like fields are checked for "unchanged".
    if (_label !== "folder") expect(isLayoutUnchanged(diff)).toBe(true);
    else expect(diff.changedIds.has("A")).toBe(true);
  });

  it.each([
    ["semantic", { ...DEFAULT_LAYOUT_WEIGHTS, semantic: 0 }, (n: ScatterNode) => (n.embedding = [9, 9, 9])],
    ["links", { ...DEFAULT_LAYOUT_WEIGHTS, links: 0 }, null],
  ] as const)("ignores the inputs of the %s signal while its weight is 0", (_label, weights, mutate) => {
    const off: LayoutSettingsInputs = { weights, links: settings.links };
    const nodes = [node("A"), node("B")];
    const before = captureLayoutSnapshot(nodes, [], vocab, off);
    const changed = nodes.map((n) => ({ ...n }));
    if (mutate) mutate(changed[0]);
    const links = mutate ? off.links : new Map([["topic/A.md", ["topic/C.md"]]]);
    expect(isLayoutUnchanged(diffLayoutSnapshots(before, captureLayoutSnapshot(changed, [], vocab, { weights, links })))).toBe(true);
  });

  it("ignores attracting relations while the relation weight is 0, but keeps repelling ones", () => {
    const weights = { ...DEFAULT_LAYOUT_WEIGHTS, relations: 0 };
    const nodes = [node("A"), node("B")];
    const before = captureLayoutSnapshot(nodes, [], vocab, { weights });
    expect(isLayoutUnchanged(diffLayoutSnapshots(before, captureLayoutSnapshot(nodes, [edge()], vocab, { weights })))).toBe(true);
    expect(isLayoutUnchanged(diffLayoutSnapshots(before, captureLayoutSnapshot(nodes, [edge("CONFLICTS_WITH")], vocab, { weights })))).toBe(false);
  });

  it("reports added and removed nodes", () => {
    const diff = diffAfter((nodes) => ({ nodes: [nodes[0], node("C")] }));
    expect([...diff.addedIds]).toEqual(["C"]);
    expect([...diff.removedIds]).toEqual(["B"]);
  });

  it.each<[string, (edges: RelationEdge[]) => RelationEdge[]]>([
    ["an added edge", (edges) => [...edges, edge("REQUIRES", "B", "C")]],
    ["a removed edge", () => []],
    ["a type with another force", () => [edge("CONFLICTS_WITH")]],
  ])("marks the endpoints of %s", (_label, change) => {
    const diff = diffAfter((nodes, edges) => ({ nodes: [...nodes, node("C")], edges: change(edges) }));
    expect(diff.edgeEndpointIds.has("A") || diff.edgeEndpointIds.has("B")).toBe(true);
  });

  it("ignores description and direction of a relation edge", () => {
    const diff = diffAfter((_nodes, edges) => ({ edges: [{ ...edges[0], desc: "another reason", srcId: "B", tgtId: "A", bidirectional: true }] }));
    expect(isLayoutUnchanged(diff)).toBe(true);
  });

  it("marks the endpoints when a vocabulary weight changes", () => {
    const diff = diffAfter(() => ({ vocabulary: [{ label: "REQUIRES", weight: 1.3 } as RelationTermDef] }));
    expect([...diff.edgeEndpointIds].sort()).toEqual(["A", "B"]);
  });

  it.each([
    ["semantic", { semantic: 0.5 }],
    ["links", { links: 1 }],
    ["relations", { relations: 2 }],
  ] as const)("reports a settings change when the %s weight changes", (_label, patch) => {
    expect(diffAfter(() => ({ settings: { ...settings, weights: { ...DEFAULT_LAYOUT_WEIGHTS, ...patch } } })).settingsChanged).toBe(true);
  });

  it("does not hold node or cloud spacing: the engine scales or waits (Plan 0005 S4, S5)", () => {
    expect(Object.keys(settings).sort()).toEqual(["links", "weights"]);
  });
});
