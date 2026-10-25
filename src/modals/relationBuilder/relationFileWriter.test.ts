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

vi.mock("obsidian", async () => {
  const yaml = await import("yaml");
  return {
    TFile: MockTFile,
    TFolder: class {},
    stringifyYaml: (obj: unknown) => yaml.stringify(obj),
    parseYaml: (str: string) => yaml.parse(str),
  };
});

import { findRelationBatchConflict, findRelationPathConflict, writeRelationFile } from "./relationFileWriter";
import { parseFrontmatter } from "../../frontmatterYaml";

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


describe("batch preflight (#73)", () => {
  it("rejects duplicate targets even when the target does not exist yet", () => {
    expect(findRelationBatchConflict(mockAppWithFiles([]), ["new.md", "new.md"])).toBe("new.md");
  });

  it("does not allow another batch entry to overwrite the edited slot", () => {
    expect(findRelationBatchConflict(mockAppWithFiles(["old.md"]), ["old.md", "old.md"], "old.md")).toBe("old.md");
  });

  it("allows an in-place edit followed by distinct new files", () => {
    expect(findRelationBatchConflict(mockAppWithFiles(["old.md"]), ["old.md", "new.md"], "old.md")).toBeUndefined();
  });
});

describe("writeRelationFile (Issue #246)", () => {
  function createMockApp(initialFiles: Record<string, string> = {}) {
    const files = new Map<string, string>(Object.entries(initialFiles));
    const app = {
      vault: {
        getAbstractFileByPath: (path: string): TAbstractFile | null => {
          if (files.has(path)) {
            return new MockTFile(path) as unknown as TAbstractFile;
          }
          return null;
        },
        read: vi.fn(async (file: TAbstractFile) => files.get((file as { path: string }).path) ?? ""),
        modify: vi.fn(async (file: TAbstractFile, content: string) => {
          files.set((file as { path: string }).path, content);
        }),
        create: vi.fn(async (path: string, content: string) => {
          if (files.has(path)) throw new Error("File already exists");
          files.set(path, content);
        }),
        createFolder: vi.fn(async () => {}),
      },
    } as unknown as App;
    return { app, files };
  }

  const existingRelationNote = `---
type: relation
title: Alpha -> Beta (REQUIRES)
description: Alpha ist die Basis für Beta.
relation_type: REQUIRES
status: draft
id: 01JA987654321
thoughtmap:
  canvas: "Brain.canvas"
tags:
  - foundations
---

> [!NOTE] User remark before heading

# Relation: [[Alpha]] -> [[Beta]]

- **Typ:** \`REQUIRES\`

## Grund
Alpha ist die Basis für Beta.

## Custom User Section
Here are user-specific reflections.
`;

  const freshlyGeneratedNote = `---
type: relation
title: Alpha -> Beta (PROVES)
description: Alpha beweist Beta direkt.
relation_type: PROVES
status: draft
sources:
  - Alpha.md
  - Beta.md
---

# Relation: [[Alpha]] -> [[Beta]]

- **Typ:** \`PROVES\`

## Grund
Alpha beweist Beta direkt.
`;

  it("preserves foreign frontmatter and custom body when editing in-place", async () => {
    const path = "wiki/relations/rel-alpha-to-beta.md";
    const { app, files } = createMockApp({ [path]: existingRelationNote });

    await writeRelationFile(app, path, freshlyGeneratedNote, path);

    const updated = files.get(path);
    expect(updated).toBeDefined();

    const parsedFm = parseFrontmatter(updated!);
    // Unknown fields preserved
    expect(parsedFm?.id).toBe("01JA987654321");
    expect(parsedFm?.thoughtmap).toEqual({ canvas: "Brain.canvas" });
    expect(parsedFm?.tags).toEqual(["foundations"]);

    // MemVector fields updated
    expect(parsedFm?.title).toBe("Alpha -> Beta (PROVES)");
    expect(parsedFm?.description).toBe("Alpha beweist Beta direkt.");
    expect(parsedFm?.relation_type).toBe("PROVES");
    expect(parsedFm?.sources).toEqual(["Alpha.md", "Beta.md"]);

    // Note body preserved outside generated section
    expect(updated).toContain("> [!NOTE] User remark before heading");
    expect(updated).toContain("## Grund\nAlpha beweist Beta direkt.");
    expect(updated).toContain("## Custom User Section\nHere are user-specific reflections.");
  });

  it("keeps an existing verified value when a relation note is edited (vault schema 2 writes none)", async () => {
    for (const [verified, value] of [["null", null], ['"2026-01-01"', "2026-01-01"]] as const) {
      const path = "wiki/relations/rel-alpha-to-beta.md";
      const existing = existingRelationNote.replace("type: relation\n", `type: relation\nverified: ${verified}\n`);
      const { app, files } = createMockApp({ [path]: existing });
      await writeRelationFile(app, path, freshlyGeneratedNote, path);
      const fm = parseFrontmatter(files.get(path)!);
      expect(fm && "verified" in fm).toBe(true);
      expect(String(fm?.verified ?? null)).toBe(String(value));
    }
  });

  it("preserves foreign frontmatter and custom body when renaming/moving a relation", async () => {
    const oldPath = "wiki/relations/rel-alpha-to-beta-requires.md";
    const newPath = "wiki/relations/rel-alpha-to-beta-proves.md";
    const { app, files } = createMockApp({ [oldPath]: existingRelationNote });

    await writeRelationFile(app, newPath, freshlyGeneratedNote, oldPath);

    const created = files.get(newPath);
    expect(created).toBeDefined();

    const parsedFm = parseFrontmatter(created!);
    expect(parsedFm?.id).toBe("01JA987654321");
    expect(parsedFm?.thoughtmap).toEqual({ canvas: "Brain.canvas" });
    expect(parsedFm?.tags).toEqual(["foundations"]);

    expect(created).toContain("> [!NOTE] User remark before heading");
    expect(created).toContain("## Custom User Section\nHere are user-specific reflections.");
  });

  it("writes raw content directly when creating a new relation without initialEdgePath", async () => {
    const newPath = "wiki/relations/brand-new.md";
    const { app, files } = createMockApp({});

    await writeRelationFile(app, newPath, freshlyGeneratedNote);

    expect(files.get(newPath)).toBe(freshlyGeneratedNote);
  });
});
