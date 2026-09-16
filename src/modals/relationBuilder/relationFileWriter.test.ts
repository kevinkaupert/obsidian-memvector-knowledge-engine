import { describe, expect, it, vi } from "vitest";
import type { App, TAbstractFile } from "obsidian";

const { MockTFile } = vi.hoisted(() => {
  class MockTFile {
    path: string;
    name: string;
    constructor(path: string) {
      this.path = path;
      this.name = path.split("/").pop() || "";
    }
  }
  return { MockTFile };
});

vi.mock("obsidian", () => ({
  TFile: MockTFile,
}));

import { findRelationPathConflict } from "./relationFileWriter";

function mockAppWithFiles(existingPaths: string[]): App {
  const fileSet = new Set(existingPaths);
  return {
    vault: {
      getAbstractFileByPath: (path: string): TAbstractFile | null => {
        if (fileSet.has(path)) {
          return new MockTFile(path) as unknown as TAbstractFile;
        }
        return null;
      },
    },
  } as unknown as App;
}

describe("findRelationPathConflict (F06)", () => {
  it("allows in-place edit of the same relation file without reporting conflict", () => {
    const path = "wiki/relations/rel-alpha-to-beta-requires.md";
    const app = mockAppWithFiles([path]);

    // Editing the same slot with unchanged path:
    const hasConflict = findRelationPathConflict(app, path, path);
    expect(hasConflict).toBe(false);
  });

  it("detects conflict when changing type to one that already exists between the same notes", () => {
    const oldPath = "wiki/relations/rel-alpha-to-beta-requires.md";
    const existingOtherTypePath = "wiki/relations/rel-alpha-to-beta-conflicts-with.md";
    const app = mockAppWithFiles([oldPath, existingOtherTypePath]);

    // Editing oldPath, but target is existingOtherTypePath:
    const hasConflict = findRelationPathConflict(app, existingOtherTypePath, oldPath);
    expect(hasConflict).toBe(true);
  });

  it("allows changing type to a new type that does not yet have a relation file", () => {
    const oldPath = "wiki/relations/rel-alpha-to-beta-requires.md";
    const newUnusedPath = "wiki/relations/rel-alpha-to-beta-proves.md";
    const app = mockAppWithFiles([oldPath]);

    const hasConflict = findRelationPathConflict(app, newUnusedPath, oldPath);
    expect(hasConflict).toBe(false);
  });

  it("detects conflict when creating a new relation whose file already exists", () => {
    const existingPath = "wiki/relations/rel-alpha-to-beta-requires.md";
    const app = mockAppWithFiles([existingPath]);

    // Creation has no initialEdgePath:
    const hasConflict = findRelationPathConflict(app, existingPath, undefined);
    expect(hasConflict).toBe(true);
  });

  it("allows creating a new relation when no conflicting file exists", () => {
    const app = mockAppWithFiles([]);
    const targetPath = "wiki/relations/rel-alpha-to-beta-proves.md";

    const hasConflict = findRelationPathConflict(app, targetPath, undefined);
    expect(hasConflict).toBe(false);
  });
});
