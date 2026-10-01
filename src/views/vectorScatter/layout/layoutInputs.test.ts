import { describe, expect, it } from "vitest";
import type { RelationEdge, ScatterNode } from "../types";
import type { RelationTermDef } from "../../../relationVocabulary/types";
import { captureLayoutSnapshot, diffLayoutSnapshots, isLayoutUnchanged, type LayoutSettingsInputs } from "./layoutInputs";

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

const settings: LayoutSettingsInputs = { nodeSpacing: 350, cloudSpacing: 800, knowledgeDomain: "general", includeWikiLinksAsRelations: false };
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
    ["excerpt words", (n) => (n.content = "alpha beta delta")],
    ["links anywhere in the note", (n) => (n.links = ["other", "late-link"])],
    ["folder", (n) => (n.path = "elsewhere/A.md")],
    ["vector", (n) => (n.embedding = [0.1, 0.2, 0.31])],
    ["vector removed", (n) => (n.embedding = undefined)],
  ])("marks a node as changed when its %s change", (_label, mutate) => {
    const diff = diffAfter((nodes) => {
      mutate(nodes[0]);
      return { nodes };
    });
    expect([...diff.changedIds]).toEqual(["A"]);
  });

  it("marks formulas anywhere in the note as a change in the math domain", () => {
    const math = { ...settings, knowledgeDomain: "math" };
    const nodes = [node("A"), node("B")];
    const before = captureLayoutSnapshot(nodes, [], vocab, math);
    const changed = nodes.map((n) => ({ ...n }));
    changed[0].latexFormulas = ["a^2", "e^{i\\pi}"];
    expect([...diffLayoutSnapshots(before, captureLayoutSnapshot(changed, [], vocab, math)).changedIds]).toEqual(["A"]);
  });

  it.each<[string, (n: ScatterNode) => void]>([
    ["title", (n) => (n.title = "Renamed title")],
    ["type", (n) => (n.type = "theorem")],
    ["position", (n) => ((n.x = 999), (n.y = -5))],
    ["excerpt-independent formulas outside the math domain", (n) => (n.latexFormulas = ["x"])],
  ])("does not treat a %s change as a layout change", (_label, mutate) => {
    expect(
      isLayoutUnchanged(
        diffAfter((nodes) => {
          mutate(nodes[0]);
          return { nodes };
        })
      )
    ).toBe(true);
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

  it.each<[string, Partial<LayoutSettingsInputs>]>([
    ["node spacing", { nodeSpacing: 400 }],
    ["cloud spacing", { cloudSpacing: 900 }],
    ["knowledge domain", { knowledgeDomain: "math" }],
    ["WikiLinks as relations", { includeWikiLinksAsRelations: true }],
  ])("reports a settings change for %s", (_label, patch) => {
    expect(diffAfter(() => ({ settings: { ...settings, ...patch } })).settingsChanged).toBe(true);
  });
});
