import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import type { MemVectorSettings } from "../../settings/types";
import { DEFAULT_SETTINGS } from "../../settings/defaults";
import { enrichContext } from "./contextEnrichment";
import type { ScatterNode } from "./types";
import type { VectorSearchHit, VectorStore } from "../../sync/vectorStore";
import type { GraphStore } from "../../sync/graphStore";

function makeScatterNode(id: string, path: string, embedding?: number[]): ScatterNode {
  return {
    id,
    title: id,
    path,
    basenameKey: id,
    content: "content",
    type: "concept",
    x: 0,
    y: 0,
    latexFormulas: [],
    links: [],
    embedding,
  };
}

const { MockTFile } = vi.hoisted(() => {
  class MockTFile {
    path: string;
    basename: string;
    name: string;
    constructor(path: string) {
      this.path = path;
      this.name = path.split("/").pop() || "";
      this.basename = this.name.replace(/\.md$/, "");
    }
  }
  return { MockTFile };
});

// Mock obsidian TFile
vi.mock("obsidian", () => ({
  TFile: MockTFile,
}));

// Mock storeFactory to return controlled mock vector and graph stores
const mockVectorStore: Partial<VectorStore> = {
  getVector: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  search: vi.fn(),
};

const mockGraphStore: Partial<GraphStore> = {
  fetchNeighbors: vi.fn(),
};

vi.mock("../../sync/storeFactory", () => ({
  getVectorStore: () => mockVectorStore as VectorStore,
  getGraphStore: () => mockGraphStore as GraphStore,
}));

function makeMockApp(files: Map<string, string>): App {
  return {
    vault: {
      getAbstractFileByPath: (path: string) => {
        if (files.has(path)) {
          return new MockTFile(path);
        }
        return null;
      },
      cachedRead: async (file: { path: string }) => {
        return files.get(file.path) || "";
      },
    },
  } as unknown as App;
}

describe("contextEnrichment (Issue #15)", () => {
  const longContent = `---
title: Long Note
type: concept
---
# Long Note Body
First part of content with marker [MARKER-1-VOR-500].
${"a".repeat(400)}
[MARKER-2-BEI-450-ZEICHEN]
${"b".repeat(150)}
[MARKER-3-NACH-500-ZEICHEN: Sollte in Frontier-Prompts enthalten sein!]
${"c".repeat(400)}
[MARKER-4-BEI-1000-ZEICHEN: Weit hinter der 500-Zeichen Grenze!]`;

  it("reads fresh full note text for vector neighbors exceeding index-time 500-char snapshot", async () => {
    const files = new Map<string, string>();
    files.set("wiki/vector-neighbor.md", longContent);

    const app = makeMockApp(files);
    const settings: MemVectorSettings = { ...DEFAULT_SETTINGS };

    // Simulate stored vector hit with a 500-char truncated payload
    const truncatedPayloadContent = longContent.slice(0, 500);
    const mockHits: VectorSearchHit[] = [
      {
        score: 0.95,
        payload: {
          path: "wiki/vector-neighbor.md",
          title: "vector-neighbor",
          content: truncatedPayloadContent,
        },
      },
    ];
    vi.mocked(mockVectorStore.search!).mockResolvedValue(mockHits);
    vi.mocked(mockGraphStore.fetchNeighbors!).mockResolvedValue([]);

    const selectedNode = makeScatterNode("wiki/selected", "wiki/selected.md", [0.1, 0.2, 0.3]);

    // 1. Frontier model tier: excerptLength is 2000 chars
    const enrichedFrontier = await enrichContext(app, settings, [selectedNode], 2, 2000, 4);

    expect(enrichedFrontier.length).toBe(1);
    const neighbor = enrichedFrontier[0];
    expect(neighbor.sources).toEqual(["vector"]);
    // Must contain markers far beyond 500 characters
    expect(neighbor.content).toContain("[MARKER-1-VOR-500]");
    expect(neighbor.content).toContain("[MARKER-2-BEI-450-ZEICHEN]");
    expect(neighbor.content).toContain("[MARKER-3-NACH-500-ZEICHEN");
    expect(neighbor.content).toContain("[MARKER-4-BEI-1000-ZEICHEN");
    expect(neighbor.content.length).toBeGreaterThan(1000);
  });

  it("enforces compact budget cap when excerptLength is small (e.g. 500 chars)", async () => {
    const files = new Map<string, string>();
    files.set("wiki/vector-neighbor.md", longContent);

    const app = makeMockApp(files);
    const settings: MemVectorSettings = { ...DEFAULT_SETTINGS };

    const mockHits: VectorSearchHit[] = [
      {
        score: 0.95,
        payload: {
          path: "wiki/vector-neighbor.md",
          title: "vector-neighbor",
          content: "cached 500 char snippet",
        },
      },
    ];
    vi.mocked(mockVectorStore.search!).mockResolvedValue(mockHits);
    vi.mocked(mockGraphStore.fetchNeighbors!).mockResolvedValue([]);

    const selectedNode = makeScatterNode("wiki/selected", "wiki/selected.md", [0.1, 0.2, 0.3]);

    // Compact model tier: excerptLength is 500 chars
    const enrichedCompact = await enrichContext(app, settings, [selectedNode], 2, 500, 4);

    expect(enrichedCompact.length).toBe(1);
    const neighbor = enrichedCompact[0];
    expect(neighbor.content.length).toBe(500);
    expect(neighbor.content).toContain("[MARKER-1-VOR-500]");
    // Beyond 500 should be capped
    expect(neighbor.content).not.toContain("[MARKER-3-NACH-500-ZEICHEN");
  });

  it("safely falls back to payload content if cachedRead is empty", async () => {
    const files = new Map<string, string>();
    files.set("wiki/fallback-neighbor.md", ""); // empty file on disk

    const app = makeMockApp(files);
    const settings: MemVectorSettings = { ...DEFAULT_SETTINGS };

    const mockHits: VectorSearchHit[] = [
      {
        score: 0.9,
        payload: {
          path: "wiki/fallback-neighbor.md",
          title: "fallback-neighbor",
          content: "Stored index payload content",
        },
      },
    ];
    vi.mocked(mockVectorStore.search!).mockResolvedValue(mockHits);
    vi.mocked(mockGraphStore.fetchNeighbors!).mockResolvedValue([]);

    const selectedNode = makeScatterNode("wiki/selected", "wiki/selected.md", [0.1, 0.2, 0.3]);

    const enriched = await enrichContext(app, settings, [selectedNode], 2, 1000, 4);

    expect(enriched.length).toBe(1);
    expect(enriched[0].content).toBe("Stored index payload content");
  });
});


describe("context exclusions (#82)", () => {
  it.each(["-path:private", "-file:secret", "path:public"])(
    "applies changed exclusions before reading stale vector/graph hits: %s",
    async (exclusions) => {
      const paths = ["private/secret.md", "public/allowed.md"];
      const app = makeMockApp(new Map(paths.map((path) => [path, `Body of ${path}`])));
      const read = vi.spyOn(app.vault, "cachedRead");
      const settings = { ...DEFAULT_SETTINGS, vectorSearchExclusions: "" };
      vi.mocked(mockVectorStore.search!).mockResolvedValue(paths.map((path) => ({
        score: 0.9, payload: { path, title: path, content: "Stale payload" },
      })));
      vi.mocked(mockGraphStore.fetchNeighbors!).mockResolvedValue(paths.map((path) => ({
        id: path.replace(/\.md$/, ""), path, title: path, hops: 1,
      })));
      const selected = [makeScatterNode("selected", "selected.md", [0.1, 0.2, 0.3])];
      expect(await enrichContext(app, settings, selected)).toHaveLength(2);

      // The index and its hits stay unchanged; only the live setting changes.
      settings.vectorSearchExclusions = exclusions;
      read.mockClear();
      const result = await enrichContext(app, settings, selected, 1);
      expect(result.map((note) => note.path)).toEqual(["public/allowed.md"]);
      expect(result[0].sources).toEqual(["vector", "graph"]);
      expect(read.mock.calls.map(([file]) => file.path)).toEqual([
        "public/allowed.md", "public/allowed.md",
      ]);

      settings.vectorSearchExclusions = "-path:private -path:public";
      read.mockClear();
      expect(await enrichContext(app, settings, selected)).toEqual([]);
      expect(read).not.toHaveBeenCalled();
    }
  );
});

describe("synthesis hop depth (#89)", () => {
  it.each([1, 2, 3])("fetches graph neighbors with configured hop depth: %d hops", async (hops) => {
    const files = new Map([
      ["selected.md", "Selected note body"],
      ["neighbor.md", "Neighbor note body"],
    ]);
    const app = makeMockApp(files);
    const settings: MemVectorSettings = { ...DEFAULT_SETTINGS, synthesisHopDepth: hops };
    vi.mocked(mockVectorStore.search!).mockResolvedValue([]);
    vi.mocked(mockGraphStore.fetchNeighbors!).mockResolvedValue([
      { id: "neighbor", path: "neighbor.md", title: "Neighbor", hops: 1 },
    ]);
    const selected = [makeScatterNode("selected", "selected.md", [0.1, 0.2, 0.3])];

    await enrichContext(app, settings, selected);

    expect(mockGraphStore.fetchNeighbors).toHaveBeenCalledWith(["selected"], hops, expect.any(Number));
  });

  it("allows explicit hop depth parameter to override settings", async () => {
    const files = new Map([
      ["selected.md", "Selected note body"],
      ["neighbor.md", "Neighbor note body"],
    ]);
    const app = makeMockApp(files);
    const settings: MemVectorSettings = { ...DEFAULT_SETTINGS, synthesisHopDepth: 2 };
    vi.mocked(mockVectorStore.search!).mockResolvedValue([]);
    vi.mocked(mockGraphStore.fetchNeighbors!).mockResolvedValue([]);
    const selected = [makeScatterNode("selected", "selected.md", [0.1, 0.2, 0.3])];

    await enrichContext(app, settings, selected, 2, 200, 4, 3);

    expect(mockGraphStore.fetchNeighbors).toHaveBeenCalledWith(["selected"], 3, expect.any(Number));
  });
});

