import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import type { GraphStore, TypedEdgeInput } from "../../sync/graphStore";
import { saveRelation, type PreviousRelation } from "./relationSave";
import { relationFilePaths } from "./relationFileTemplate";
import { pathToId } from "../../noteSlug";
import { findRelationBatchConflict, writeRelationFile } from "./relationFileWriter";

vi.mock("obsidian", () => ({
  TFile: class { constructor(public path: string) {} },
  TFolder: class {},
}));
import { TFile } from "obsidian";

const previous: PreviousRelation = { path: "wiki/relations/old.md", srcId: "a", tgtId: "b", relType: "REQUIRES" };
const replacement: TypedEdgeInput = {
  src: { id: "a", path: "A.md", title: "A" },
  tgt: { id: "b", path: "B.md", title: "B" },
  relType: "PROVES", description: "Updated reason",
};
const target = "wiki/relations/new.md";
const key = (src: string, tgt: string, type: string) => JSON.stringify([src, tgt, type]);

function fixture() {
  const files = new Map([[previous.path, "Original content"]]);
  const edges = new Set([key("a", "b", "REQUIRES")]);
  const events: string[] = [];
  const create = vi.fn(async (path: string, content: string) => {
    if (files.has(path)) throw new Error("Already exists");
    files.set(path, content);
    events.push("create");
  });
  const modify = vi.fn(async (file: TFile, content: string) => {
    files.set(file.path, content);
    events.push("modify");
  });
  const trashFile = vi.fn(async (file: TFile) => {
    files.delete(file.path);
    events.push("trash");
  });
  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => files.has(path) ? Object.assign(new TFile(), { path }) : null,
      createFolder: vi.fn(async () => {}), create, modify,
    },
    fileManager: { trashFile },
  } as unknown as App;
  const store = {
    upsertTypedEdges: vi.fn(async (input: TypedEdgeInput[]) => {
      for (const e of input) edges.add(key(e.src.id, e.tgt.id, e.relType));
      events.push("upsert");
    }),
    deleteEdge: vi.fn(async (src: string, tgt: string, type: string) => {
      edges.delete(key(src, tgt, type));
      events.push("delete");
    }),
  };
  return { app, store, graph: store as unknown as GraphStore, files, edges, events, create, modify, trashFile };
}

describe("safe relation replacement (#73)", () => {
  it.each(["create", "modify"] as const)("preserves the old file and graph if %s fails", async (operation) => {
    const f = fixture();
    f[operation].mockRejectedValueOnce(new Error("Disk full"));
    await expect(saveRelation(f.app, f.graph, operation === "modify" ? previous.path : target,
      "New content", replacement, previous)).rejects.toThrow("Disk full");
    expect(f.files.get(previous.path)).toBe("Original content");
    expect(f.edges.has(key("a", "b", "REQUIRES"))).toBe(true);
    expect(f.store.upsertTypedEdges).not.toHaveBeenCalled();
    expect(f.store.deleteEdge).not.toHaveBeenCalled();
    expect(f.trashFile).not.toHaveBeenCalled();
  });

  it("writes the replacement file and graph before removing the previous relation", async () => {
    const f = fixture();
    await saveRelation(f.app, f.graph, target, "New content", replacement, previous);
    expect(f.events).toEqual(["create", "upsert", "delete", "delete", "trash"]);
    expect(f.files.get(target)).toBe("New content");
    expect(f.files.has(previous.path)).toBe(false);
    expect([...f.edges]).toEqual([key("a", "b", "PROVES")]);
  });

  it("retains the previous file and edge if graph upsert fails", async () => {
    const f = fixture();
    f.store.upsertTypedEdges.mockRejectedValueOnce(new Error("Graph unavailable"));
    await expect(saveRelation(f.app, f.graph, target, "New content", replacement, previous)).rejects.toThrow("Graph unavailable");
    expect(f.files.get(previous.path)).toBe("Original content");
    expect(f.files.get(target)).toBe("New content");
    expect(f.edges.has(key("a", "b", "REQUIRES"))).toBe(true);
    expect(f.store.deleteEdge).not.toHaveBeenCalled();
    expect(f.trashFile).not.toHaveBeenCalled();
  });

  it.each([false, true])("does not delete the replacement when an old key is reused (swapped: %s)", async (swapped) => {
    const f = fixture();
    const edge = { ...replacement, relType: previous.relType,
      src: swapped ? replacement.tgt : replacement.src,
      tgt: swapped ? replacement.src : replacement.tgt };
    await saveRelation(f.app, f.graph, swapped ? target : previous.path, "New content", edge, previous);
    expect([...f.edges]).toEqual([key(edge.src.id, edge.tgt.id, edge.relType)]);
    if (!swapped) expect(f.trashFile).not.toHaveBeenCalled();
  });

  it("surfaces cleanup failure without trashing the original file", async () => {
    const f = fixture();
    f.store.deleteEdge.mockRejectedValueOnce(new Error("Cleanup failed"));
    await expect(saveRelation(f.app, f.graph, target, "New content", replacement, previous)).rejects.toThrow("Cleanup failed");
    expect(f.files.has(previous.path)).toBe(true);
    expect(f.files.has(target)).toBe(true);
    expect(f.trashFile).not.toHaveBeenCalled();
  });
});

describe("relation file create races (#73)", () => {
  it("never modifies an existing file unless it is the explicitly edited path", async () => {
    const f = fixture();
    await expect(writeRelationFile(f.app, previous.path, "Overwrite")).rejects.toThrow("already exists");
    expect(f.files.get(previous.path)).toBe("Original content");
    expect(f.modify).not.toHaveBeenCalled();
  });

  it("allows only one concurrent creation of a target file", async () => {
    const f = fixture();
    const results = await Promise.allSettled([
      writeRelationFile(f.app, target, "First"), writeRelationFile(f.app, target, "Second"),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(f.files.get(target)).toBe("First");
    expect(f.modify).not.toHaveBeenCalled();
  });
});


describe("collision-safe relation saving (#74)", () => {
  it("saves formerly colliding note pairs in one batch without overwriting either file", async () => {
    const f = fixture();
    const relations = ["Work/Overview.md", "Work-Overview.md"].map((path) => ({
      src: { id: pathToId(path), path, title: "Overview", type: "concept" },
      tgt: { ...replacement.tgt, type: "concept" },
      label: "REQUIRES", bidirectional: false, originalTerm: "requires",
    }));
    const paths = await relationFilePaths(relations, []);
    expect(findRelationBatchConflict(f.app, paths)).toBeUndefined();
    for (const [index, relation] of relations.entries()) {
      await saveRelation(f.app, f.graph, paths[index], relation.src.path, {
        ...relation, relType: relation.label, description: "",
      });
    }
    expect(paths[0]).not.toBe(paths[1]);
    expect(paths.map((path) => f.files.get(path))).toEqual(["Work/Overview.md", "Work-Overview.md"]);
    expect(f.modify).not.toHaveBeenCalled();
  });

  it("edits a legacy relation in place while rejecting new creation of that same relation", async () => {
    const f = fixture();
    const relation = {
      src: { ...replacement.src, type: "concept" }, tgt: { ...replacement.tgt, type: "concept" },
      label: previous.relType, bidirectional: false, originalTerm: "requires",
    };
    const paths = await relationFilePaths([relation], [previous], previous.path);
    expect(findRelationBatchConflict(f.app, paths)).toBe(previous.path);
    expect(findRelationBatchConflict(f.app, paths, previous.path)).toBeUndefined();
    await saveRelation(f.app, f.graph, paths[0], "Edited legacy relation", {
      ...relation, relType: relation.label, description: "",
    }, previous);
    expect([...f.files.entries()]).toEqual([[previous.path, "Edited legacy relation"]]);
    expect(f.create).not.toHaveBeenCalled();
    expect(f.trashFile).not.toHaveBeenCalled();
  });
});
