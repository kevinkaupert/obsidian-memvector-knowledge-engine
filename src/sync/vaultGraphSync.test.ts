import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { extractVaultGraph } from "./vaultGraphSync";

interface FakeFile {
  path: string;
  basename: string;
  links?: string[];
}

/**
 * Minimal fake of just the vault.getMarkdownFiles/metadataCache surface
 * extractVaultGraph needs. getFirstLinkpathDest mimics Obsidian's own
 * link-resolution API (exact path match, falling back to unique basename)
 * rather than the plugin string-guessing at a raw link string itself.
 */
function fakeApp(files: FakeFile[]): App {
  const tfiles = files.map((f) => ({ path: f.path, basename: f.basename, name: `${f.basename}.md` }));

  return {
    vault: {
      getMarkdownFiles: () => tfiles,
    },
    metadataCache: {
      getFileCache: (file: { path: string }) => {
        const src = files.find((f) => f.path === file.path);
        return src?.links ? { links: src.links.map((l) => ({ link: l })) } : undefined;
      },
      getFirstLinkpathDest: (linktext: string) => {
        const normalized = linktext.replace(/\.md$/i, "");
        const byPath = tfiles.find((f) => f.path.replace(/\.md$/i, "") === normalized);
        if (byPath) return byPath;
        return tfiles.find((f) => f.basename === normalized) || null;
      },
    },
  } as unknown as App;
}

describe("extractVaultGraph", () => {
  it("gives same-basename notes in different folders distinct node ids (F04b)", () => {
    const app = fakeApp([
      { path: "Work/Overview.md", basename: "Overview" },
      { path: "Home/Overview.md", basename: "Overview" },
    ]);
    const { nodes } = extractVaultGraph(app);

    expect(nodes).toHaveLength(2);
    const ids = new Set(nodes.map((n) => n.id));
    expect(ids.size).toBe(2);
  });

  it("resolves a WikiLink to the exact target file via Obsidian's own API, not a basename guess (F04a groundwork)", () => {
    const app = fakeApp([
      { path: "Work/Overview.md", basename: "Overview" },
      { path: "Home/Overview.md", basename: "Overview" },
      { path: "Alpha.md", basename: "Alpha", links: ["Home/Overview"] },
    ]);
    const { nodes, edges } = extractVaultGraph(app);

    const alpha = nodes.find((n) => n.path === "Alpha.md")!;
    const homeOverview = nodes.find((n) => n.path === "Home/Overview.md")!;
    const workOverview = nodes.find((n) => n.path === "Work/Overview.md")!;

    const edge = edges.find((e) => e.src === alpha.id);
    expect(edge?.tgt).toBe(homeOverview.id);
    expect(edge?.tgt).not.toBe(workOverview.id);
  });

  it("falls back to a slug of the raw link text for a dangling (unresolvable) link", () => {
    const app = fakeApp([{ path: "Alpha.md", basename: "Alpha", links: ["Does Not Exist"] }]);
    const { edges } = extractVaultGraph(app);

    expect(edges).toHaveLength(1);
    expect(edges[0].tgt).toBe("does-not-exist");
  });
});
