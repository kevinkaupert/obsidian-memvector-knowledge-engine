import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import type { MemVectorSettings } from "../../settings/types";
import { DEFAULT_SETTINGS } from "../../settings/defaults";
import { assembleContextNotes, enrichContext, type EnrichedNote } from "./contextEnrichment";
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
    const enrichedFrontier = await enrichContext(app, settings, [selectedNode], 2000);

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
    const enrichedCompact = await enrichContext(app, settings, [selectedNode], 500);

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

    const enriched = await enrichContext(app, settings, [selectedNode], 1000);

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
      const result = await enrichContext(app, settings, selected);
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

    // Issue #115: no hidden SQL-side caps - the store is queried unconstrained
    // (limit 0, perHopLimit 0) and the per-hop user quota applies client-side.
    expect(mockGraphStore.fetchNeighbors).toHaveBeenCalledWith(["selected"], hops, 0, 0);
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

    await enrichContext(app, settings, selected, 200, 3);

    expect(mockGraphStore.fetchNeighbors).toHaveBeenCalledWith(["selected"], 3, 0, 0);
  });
});

describe("per-hop neighbor quota (#103)", () => {
  function neighborNote(id: string, hops: number) {
    return { id, path: `${id}.md`, title: id, hops };
  }

  function filesFor(ids: string[]): Map<string, string> {
    return new Map(ids.map((id) => [`${id}.md`, `Body of ${id}`]));
  }

  it("adversarial: deeper hops still enter the context when hop-1 fills its quota", async () => {
    // 4 hop-1 notes, 2 hop-2 notes, per-hop quota 2 - before #103 the flat
    // per-source break stopped after the first 2 hop-1 rows and dropped hop-2.
    const ids = ["h1-a", "h1-b", "h1-c", "h1-d", "h2-a", "h2-b"];
    const app = makeMockApp(filesFor(ids));
    const settings: MemVectorSettings = { ...DEFAULT_SETTINGS, hopLevelNeighborLimit: 2, synthesisHopDepth: 2 };
    vi.mocked(mockVectorStore.search!).mockResolvedValue([]);
    vi.mocked(mockGraphStore.fetchNeighbors!).mockResolvedValue([
      neighborNote("h1-a", 1), neighborNote("h1-b", 1), neighborNote("h1-c", 1), neighborNote("h1-d", 1),
      neighborNote("h2-a", 2), neighborNote("h2-b", 2),
    ]);
    const selected = [makeScatterNode("selected", "selected.md", [0.1, 0.2, 0.3])];

    const result = await enrichContext(app, settings, selected);
    const graphIds = result.filter((n) => n.sources.includes("graph")).map((n) => n.id);

    expect(graphIds).toContain("h2-a");
    expect(graphIds.filter((id) => id.startsWith("h1-")).length).toBe(2);
    expect(graphIds.filter((id) => id.startsWith("h2-")).length).toBe(2);
  });

  it("caps each hop level at the configured quota", async () => {
    const ids = ["h1-a", "h1-b", "h1-c", "h2-a", "h2-b", "h3-a"];
    const app = makeMockApp(filesFor(ids));
    const settings: MemVectorSettings = { ...DEFAULT_SETTINGS, hopLevelNeighborLimit: 1, synthesisHopDepth: 3 };
    vi.mocked(mockVectorStore.search!).mockResolvedValue([]);
    vi.mocked(mockGraphStore.fetchNeighbors!).mockResolvedValue([
      neighborNote("h1-a", 1), neighborNote("h1-b", 1), neighborNote("h1-c", 1),
      neighborNote("h2-a", 2), neighborNote("h2-b", 2),
      neighborNote("h3-a", 3),
    ]);
    const selected = [makeScatterNode("selected", "selected.md", [0.1, 0.2, 0.3])];

    const result = await enrichContext(app, settings, selected);
    const graphIds = result.filter((n) => n.sources.includes("graph")).map((n) => n.id);

    expect(graphIds.sort()).toEqual(["h1-a", "h2-a", "h3-a"]);
  });

  it("treats 0 as unlimited per hop level", async () => {
    const ids = ["h1-a", "h1-b", "h1-c", "h2-a"];
    const app = makeMockApp(filesFor(ids));
    const settings: MemVectorSettings = { ...DEFAULT_SETTINGS, hopLevelNeighborLimit: 0, synthesisHopDepth: 2 };
    vi.mocked(mockVectorStore.search!).mockResolvedValue([]);
    vi.mocked(mockGraphStore.fetchNeighbors!).mockResolvedValue([
      neighborNote("h1-a", 1), neighborNote("h1-b", 1), neighborNote("h1-c", 1),
      neighborNote("h2-a", 2),
    ]);
    const selected = [makeScatterNode("selected", "selected.md", [0.1, 0.2, 0.3])];

    const result = await enrichContext(app, settings, selected);
    const graphIds = result.filter((n) => n.sources.includes("graph")).map((n) => n.id);

    expect(graphIds.sort()).toEqual(["h1-a", "h1-b", "h1-c", "h2-a"]);
  });

  it("keeps deeper hops represented when the total budget trims the merged list", async () => {
    // 3 vector notes + 2 hop-1 + 2 hop-2, total budget 5 - hop-balanced assembly
    // must not let hop-1 (or vector) notes crowd hop-2 out entirely.
    const ids = ["vec-a", "vec-b", "vec-c", "h1-a", "h1-b", "h2-a", "h2-b"];
    const app = makeMockApp(filesFor(ids));
    const settings: MemVectorSettings = {
      ...DEFAULT_SETTINGS,
      hopLevelNeighborLimit: 2,
      vectorNeighborLimit: 3,
      totalContextLimit: 5,
      synthesisHopDepth: 2,
    };
    vi.mocked(mockVectorStore.search!).mockResolvedValue(["vec-a", "vec-b", "vec-c"].map((id) => ({
      score: 0.9, payload: { path: `${id}.md`, title: id, content: `Body of ${id}` },
    })));
    vi.mocked(mockGraphStore.fetchNeighbors!).mockResolvedValue([
      neighborNote("h1-a", 1), neighborNote("h1-b", 1),
      neighborNote("h2-a", 2), neighborNote("h2-b", 2),
    ]);
    const selected = [makeScatterNode("selected", "selected.md", [0.1, 0.2, 0.3])];

    const result = await enrichContext(app, settings, selected);
    expect(result).toHaveLength(5);
    expect(result.some((n) => n.hops === 2)).toBe(true);
  });

  it("counts duplicate (note, hop) rows from the store only once (Issue #102)", async () => {
    const ids = ["dup", "h2-a"];
    const app = makeMockApp(filesFor(ids));
    const settings: MemVectorSettings = { ...DEFAULT_SETTINGS, hopLevelNeighborLimit: 1, synthesisHopDepth: 3 };
    vi.mocked(mockVectorStore.search!).mockResolvedValue([]);
    // The store can return the same note at multiple hop distances (Issue #102) -
    // it must consume the quota once, not once per row.
    vi.mocked(mockGraphStore.fetchNeighbors!).mockResolvedValue([
      neighborNote("dup", 1), neighborNote("h2-a", 2), neighborNote("dup", 3),
    ]);
    const selected = [makeScatterNode("selected", "selected.md", [0.1, 0.2, 0.3])];

    const result = await enrichContext(app, settings, selected);
    const graphIds = result.filter((n) => n.sources.includes("graph")).map((n) => n.id);

    expect(graphIds.sort()).toEqual(["dup", "h2-a"]);
  });

  it("adversarial (Issue #115): no hidden cap starves deeper hops when the store returns far more rows than the per-hop quota", async () => {
    const ids = [
      ...Array.from({ length: 30 }, (_, i) => `h1-${String(i).padStart(2, "0")}`),
      "h2-a", "h2-b", "h2-c",
    ];
    const app = makeMockApp(filesFor(ids));
    const settings: MemVectorSettings = { ...DEFAULT_SETTINGS, hopLevelNeighborLimit: 2, synthesisHopDepth: 2, totalContextLimit: 0 };
    vi.mocked(mockVectorStore.search!).mockResolvedValue([]);
    // The store hands back everything reachable (unconstrained fetch, Issue #115);
    // the old 3x slack SQL caps would have cut h2 rows here.
    vi.mocked(mockGraphStore.fetchNeighbors!).mockResolvedValue(ids.map((id) => neighborNote(id, id.startsWith("h2") ? 2 : 1)));
    const selected = [makeScatterNode("selected", "selected.md", [0.1, 0.2, 0.3])];

    const result = await enrichContext(app, settings, selected);
    const graphIds = result.filter((n) => n.sources.includes("graph")).map((n) => n.id);

    expect(graphIds.filter((id) => id.startsWith("h1-")).length).toBe(2);
    expect(graphIds.filter((id) => id.startsWith("h2-")).length).toBe(2);
  });

  it("caps vector neighbors at vectorNeighborLimit and treats 0 as unlimited", async () => {
    const ids = ["v-a", "v-b", "v-c"];
    const app = makeMockApp(filesFor(ids));
    const selected = [makeScatterNode("selected", "selected.md", [0.1, 0.2, 0.3])];
    const hits = ids.map((id) => ({ score: 0.9, payload: { path: `${id}.md`, title: id, content: `Body of ${id}` } }));
    vi.mocked(mockGraphStore.fetchNeighbors!).mockResolvedValue([]);

    vi.mocked(mockVectorStore.search!).mockResolvedValue(hits);
    const capped = await enrichContext(app, {
      ...DEFAULT_SETTINGS, vectorNeighborLimit: 2, totalContextLimit: 0,
    }, selected);
    expect(capped).toHaveLength(2);

    vi.mocked(mockVectorStore.search!).mockResolvedValue(hits);
    const unlimited = await enrichContext(app, {
      ...DEFAULT_SETTINGS, vectorNeighborLimit: 0, totalContextLimit: 0,
    }, selected);
    expect(unlimited).toHaveLength(3);
  });

  it("does not trim the merged context when totalContextLimit is 0 (unlimited)", async () => {
    const ids = ["v-a", "h1-a", "h1-b", "h2-a", "h2-b", "h3-a"];
    const app = makeMockApp(filesFor(ids));
    const settings: MemVectorSettings = {
      ...DEFAULT_SETTINGS,
      hopLevelNeighborLimit: 2,
      vectorNeighborLimit: 0,
      totalContextLimit: 0,
      synthesisHopDepth: 3,
    };
    vi.mocked(mockVectorStore.search!).mockResolvedValue([
      { score: 0.9, payload: { path: "v-a.md", title: "v-a", content: "Body of v-a" } },
    ]);
    vi.mocked(mockGraphStore.fetchNeighbors!).mockResolvedValue([
      neighborNote("h1-a", 1), neighborNote("h1-b", 1),
      neighborNote("h2-a", 2), neighborNote("h2-b", 2),
      neighborNote("h3-a", 3),
    ]);
    const selected = [makeScatterNode("selected", "selected.md", [0.1, 0.2, 0.3])];

    const result = await enrichContext(app, settings, selected);
    expect(result).toHaveLength(6);
  });
});

describe("vector similarity threshold (#103)", () => {
  function filesFor(ids: string[]): Map<string, string> {
    return new Map(ids.map((id) => [`${id}.md`, `Body of ${id}`]));
  }

  const hits = (specs: Array<{ id: string; score: number }>) =>
    specs.map(({ id, score }) => ({ score, payload: { path: `${id}.md`, title: id, content: `Body of ${id}` } }));

  it("drops vector hits below minVectorSimilarity", async () => {
    const app = makeMockApp(filesFor(["hi", "lo"]));
    const settings: MemVectorSettings = {
      ...DEFAULT_SETTINGS,
      vectorNeighborLimit: 0,
      minVectorSimilarity: 0.75,
    };
    vi.mocked(mockGraphStore.fetchNeighbors!).mockResolvedValue([]);
    vi.mocked(mockVectorStore.search!).mockResolvedValue(hits([{ id: "hi", score: 0.82 }, { id: "lo", score: 0.41 }]));
    const selected = [makeScatterNode("selected", "selected.md", [0.1, 0.2, 0.3])];

    const result = await enrichContext(app, settings, selected);
    expect(result.map((n) => n.id)).toEqual(["hi"]);
  });

  it("adversarial: an unlimited vector count still stays scoped to the selection by the threshold", async () => {
    // Without the threshold this is the whole-vault flood from the live test.
    const app = makeMockApp(filesFor(["a", "b", "c", "d"]));
    const settings: MemVectorSettings = {
      ...DEFAULT_SETTINGS,
      vectorNeighborLimit: 0,
      minVectorSimilarity: 0.75,
    };
    vi.mocked(mockGraphStore.fetchNeighbors!).mockResolvedValue([]);
    vi.mocked(mockVectorStore.search!).mockResolvedValue(hits([
      { id: "a", score: 0.88 }, { id: "b", score: 0.76 },
      { id: "c", score: 0.61 }, { id: "d", score: 0.32 },
    ]));
    const selected = [makeScatterNode("selected", "selected.md", [0.1, 0.2, 0.3])];

    const result = await enrichContext(app, settings, selected);
    expect(result.map((n) => n.id).sort()).toEqual(["a", "b"]);
  });

  it("treats 0 as no similarity floor", async () => {
    const app = makeMockApp(filesFor(["a", "b"]));
    const settings: MemVectorSettings = {
      ...DEFAULT_SETTINGS,
      vectorNeighborLimit: 0,
      minVectorSimilarity: 0,
    };
    vi.mocked(mockGraphStore.fetchNeighbors!).mockResolvedValue([]);
    vi.mocked(mockVectorStore.search!).mockResolvedValue(hits([{ id: "a", score: 0.9 }, { id: "b", score: 0.12 }]));
    const selected = [makeScatterNode("selected", "selected.md", [0.1, 0.2, 0.3])];

    const result = await enrichContext(app, settings, selected);
    expect(result.map((n) => n.id).sort()).toEqual(["a", "b"]);
  });

  it("passes 0 (unconstrained) to vector store search when vectorNeighborLimit is 0", async () => {
    const app = makeMockApp(new Map());
    const settings: MemVectorSettings = { ...DEFAULT_SETTINGS, vectorNeighborLimit: 0 };
    vi.mocked(mockGraphStore.fetchNeighbors!).mockResolvedValue([]);
    vi.mocked(mockVectorStore.search!).mockResolvedValue([]);
    const selected = [makeScatterNode("selected", "selected.md", [0.1, 0.2, 0.3])];

    await enrichContext(app, settings, selected);

    expect(mockVectorStore.search).toHaveBeenCalledWith(expect.any(Array), 0);
  });

  it("records the similarity score on vector notes for the context preview", async () => {
    const app = makeMockApp(filesFor(["a"]));
    const settings: MemVectorSettings = { ...DEFAULT_SETTINGS, minVectorSimilarity: 0.5 };
    vi.mocked(mockGraphStore.fetchNeighbors!).mockResolvedValue([]);
    vi.mocked(mockVectorStore.search!).mockResolvedValue(hits([{ id: "a", score: 0.83 }]));
    const selected = [makeScatterNode("selected", "selected.md", [0.1, 0.2, 0.3])];

    const result = await enrichContext(app, settings, selected);
    expect(result[0].similarity).toBe(0.83);
  });
});

describe("assembleContextNotes channel balancing (#110)", () => {
  function makeNote(id: string, source: "vector" | "graph", hops?: number, similarity?: number): EnrichedNote {
    return {
      id,
      title: id,
      path: `${id}.md`,
      content: `Body of ${id}`,
      sources: [source],
      hops,
      similarity,
    };
  }

  it("prioritizes dual-confirmed notes across channels and marks dual sources", () => {
    const vNotes = [makeNote("v1", "vector", undefined, 0.9), makeNote("shared", "vector", undefined, 0.85)];
    const gNotes = [makeNote("shared", "graph", 1), makeNote("g1", "graph", 2)];

    const assembled = assembleContextNotes(vNotes, gNotes, 3);
    expect(assembled[0].id).toBe("shared");
    expect(assembled[0].sources).toEqual(["vector", "graph"]);
    expect(assembled[0].hops).toBe(1);
    expect(assembled[0].similarity).toBe(0.85);
  });

  it("interleaves vector and graph candidates fairly when trimming to bounded totalContextLimit", () => {
    // Vector channel has 3 hits; Graph channel has 3 neighbors
    const vNotes = [
      makeNote("v1", "vector", undefined, 0.95),
      makeNote("v2", "vector", undefined, 0.90),
      makeNote("v3", "vector", undefined, 0.85),
    ];
    const gNotes = [
      makeNote("g1", "graph", 1),
      makeNote("g2", "graph", 2),
      makeNote("g3", "graph", 3),
    ];

    // Bounded limit of 3: must not be 3 vector notes! Should be 2 vector, 1 graph (interleaved)
    const assembled3 = assembleContextNotes(vNotes, gNotes, 3);
    expect(assembled3.map((n) => n.id)).toEqual(["v1", "g1", "v2"]);

    // Bounded limit of 4: 2 vector, 2 graph
    const assembled4 = assembleContextNotes(vNotes, gNotes, 4);
    expect(assembled4.map((n) => n.id)).toEqual(["v1", "g1", "v2", "g2"]);
  });

  it("exhausts available pool when one channel has fewer candidates than the budget", () => {
    const vNotes = [makeNote("v1", "vector", undefined, 0.9)];
    const gNotes = [makeNote("g1", "graph", 1), makeNote("g2", "graph", 2), makeNote("g3", "graph", 3)];

    const assembled = assembleContextNotes(vNotes, gNotes, 3);
    expect(assembled.map((n) => n.id)).toEqual(["v1", "g1", "g2"]);
  });

  it("returns all candidates without trimming when maxTotal is 0 (unlimited)", () => {
    const vNotes = [makeNote("v1", "vector"), makeNote("v2", "vector")];
    const gNotes = [makeNote("g1", "graph"), makeNote("g2", "graph")];

    const assembled = assembleContextNotes(vNotes, gNotes, 0);
    expect(assembled).toHaveLength(4);
    expect(assembled.map((n) => n.id)).toEqual(["v1", "v2", "g1", "g2"]);
  });
});

