import { describe, expect, it } from "vitest";
import { scanVaultNotes, shouldIncludeFile } from "./vaultScan";
import type { App, TFile } from "obsidian";

function file(path: string): TFile {
  const basename = path.split("/").pop()!.replace(/\.md$/, "");
  return { path, name: `${basename}.md`, basename } as TFile;
}

function makeMockApp(files: { path: string; basename: string; content?: string }[]): App {
  const tfiles = files.map((f) => ({
    path: f.path,
    name: `${f.basename}.md`,
    basename: f.basename,
  })) as TFile[];

  return {
    vault: {
      getMarkdownFiles: () => tfiles,
      cachedRead: async (f: TFile) => {
        const found = files.find((item) => item.path === f.path);
        return found?.content || `# ${f.basename}\nSome content`;
      },
    },
    metadataCache: {
      getFileCache: () => null,
    },
  } as unknown as App;
}

describe("shouldIncludeFile (Issue #45)", () => {
  it("includes all files by default when query string is empty", () => {
    expect(shouldIncludeFile(file("wiki/definitions/koerper.md"), "")).toBe(true);
    expect(shouldIncludeFile(file("TEST/test-selected.md"), "")).toBe(true);
    expect(shouldIncludeFile(file("README.md"), "")).toBe(true);
    expect(shouldIncludeFile(file("schema/test.md"), "")).toBe(true);
  });

  it("applies negative path exclusions when explicitly specified", () => {
    const query = "-path:schema -path:archive";
    expect(shouldIncludeFile(file("wiki/definitions/koerper.md"), query)).toBe(true);
    expect(shouldIncludeFile(file("schema/FRONTMATTER-SCHEMA.md"), query)).toBe(false);
    expect(shouldIncludeFile(file("archive/old-note.md"), query)).toBe(false);
  });

  it("applies negative file exclusions when explicitly specified", () => {
    const query = "-file:README -file:log";
    expect(shouldIncludeFile(file("wiki/definitions/koerper.md"), query)).toBe(true);
    expect(shouldIncludeFile(file("wiki/README.md"), query)).toBe(false);
    expect(shouldIncludeFile(file("meta/log.md"), query)).toBe(false);
  });

  it("applies positive path inclusions when specified", () => {
    const query = "path:wiki";
    expect(shouldIncludeFile(file("wiki/definitions/koerper.md"), query)).toBe(true);
    expect(shouldIncludeFile(file("TEST/test-selected.md"), query)).toBe(false);
  });
});

describe("scanVaultNotes two-tier filtering (Issue #45)", () => {
  const testFiles = [
    { path: "wiki/algebra.md", basename: "algebra" },
    { path: "wiki/analysis.md", basename: "analysis" },
    { path: "TEST/test-note.md", basename: "test-note" },
    { path: "archive/old.md", basename: "old" },
  ];

  it("returns all notes when both global exclusions and view filter are empty", async () => {
    const app = makeMockApp(testFiles);
    const nodes = await scanVaultNotes(app, "", "");
    expect(nodes.length).toBe(4);
  });

  it("applies global exclusions while keeping canvas view filter empty", async () => {
    const app = makeMockApp(testFiles);
    const nodes = await scanVaultNotes(app, "", "-path:archive");
    expect(nodes.length).toBe(3);
    expect(nodes.some((n) => n.path === "archive/old.md")).toBe(false);
    expect(nodes.some((n) => n.path === "TEST/test-note.md")).toBe(true);
  });

  it("applies transient canvas view filter on top of global exclusions", async () => {
    const app = makeMockApp(testFiles);
    // User typed "path:wiki" into the canvas filter bar, with "-path:archive" as global exclusion
    const nodes = await scanVaultNotes(app, "path:wiki", "-path:archive");
    expect(nodes.length).toBe(2);
    expect(nodes.map((n) => n.path).sort()).toEqual(["wiki/algebra.md", "wiki/analysis.md"]);
  });

  it("can filter canvas view to TEST notes without touching global exclusions", async () => {
    const app = makeMockApp(testFiles);
    // User typed "path:TEST" into the canvas filter bar
    const nodes = await scanVaultNotes(app, "path:TEST", "");
    expect(nodes.length).toBe(1);
    expect(nodes[0].path).toBe("TEST/test-note.md");
  });
});
