import { describe, it, expect, vi } from "vitest";
import type { App, TFile } from "obsidian";

vi.mock("obsidian", () => ({
  requestUrl: vi.fn(),
  TFile: class {},
}));

import { syncVaultVectors } from "./vaultVectorSync";
import type { VectorPoint, VectorStore } from "./vectorStore";
import { DEFAULT_SETTINGS } from "../settings/defaults";
import * as fetchEmbeddingModule from "../llm/fetchEmbedding";
import { pathToId } from "../noteSlug";
import { getVectorStore } from "./storeFactory";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("vaultVectorSync", () => {
  it("syncs vector points with canonical pathToId and reconciles included paths", async () => {
    const files: TFile[] = [
      { path: "Work/Overview.md", basename: "Overview", name: "Overview.md" } as unknown as TFile,
      { path: "Concepts/Deep Learning.md", basename: "Deep Learning", name: "Deep Learning.md" } as unknown as TFile,
    ];

    const fakeApp = {
      vault: {
        getMarkdownFiles: () => files,
        cachedRead: async (f: TFile) => `Content of ${f.basename}`,
      },
      secretStorage: {
        getSecret: () => "mock-secret-key",
      },
    } as unknown as App;

    vi.spyOn(fetchEmbeddingModule, "fetchEmbedding").mockResolvedValue({
      embedding: [0.1, 0.2, 0.3],
      error: null,
    });

    const syncedPoints: VectorPoint[] = [];
    const reconciledPaths: string[] = [];

    const mockStore: VectorStore = {
      testConnection: async () => {},
      syncPoints: async (points: VectorPoint[]) => {
        syncedPoints.push(...points);
      },
      search: async () => [],
      getVector: async () => null,
      getVectors: async () => new Map(),
      getStoredHashes: async () => new Map(),
      reconcile: async (paths: string[]) => {
        reconciledPaths.push(...paths);
        return { removed: 0 };
      },
    };

    const result = await syncVaultVectors(fakeApp, DEFAULT_SETTINGS, mockStore);

    expect(result.syncedCount).toBe(2);
    expect(result.skippedCount).toBe(0);
    expect(syncedPoints.length).toBe(2);

    expect(syncedPoints[0].id).toBe(pathToId("Work/Overview.md"));
    expect(syncedPoints[0].payload.path).toBe("Work/Overview.md");
    expect(syncedPoints[0].contentHash).toBeDefined();

    expect(syncedPoints[1].id).toBe(pathToId("Concepts/Deep Learning.md"));
    expect(syncedPoints[1].payload.path).toBe("Concepts/Deep Learning.md");
    expect(syncedPoints[1].contentHash).toBeDefined();

    expect(reconciledPaths).toEqual(["Work/Overview.md", "Concepts/Deep Learning.md"]);
  });

  it("skips unchanged notes when content hash matches stored hash", async () => {
    const files: TFile[] = [
      { path: "Work/Overview.md", basename: "Overview", name: "Overview.md" } as unknown as TFile,
      { path: "Concepts/Deep Learning.md", basename: "Deep Learning", name: "Deep Learning.md" } as unknown as TFile,
    ];

    const fakeApp = {
      vault: {
        getMarkdownFiles: () => files,
        cachedRead: async (f: TFile) => `Content of ${f.basename}`,
      },
      secretStorage: {
        getSecret: () => "mock-secret-key",
      },
    } as unknown as App;

    const fetchSpy = vi.spyOn(fetchEmbeddingModule, "fetchEmbedding").mockResolvedValue({
      embedding: [0.1, 0.2, 0.3],
      error: null,
    });
    fetchSpy.mockClear();

    // Work/Overview.md content is "Content of Overview"
    // Embedding text: basename + body, well under the default embeddingMaxChars cap
    const { hashString } = await import("../hash");
    const overviewHash = String(hashString("Overview\nContent of Overview"));

    const storedHashes = new Map<string, { hash: string }>();
    storedHashes.set("Work/Overview.md", { hash: overviewHash });

    const syncedPoints: VectorPoint[] = [];
    const mockStore: VectorStore = {
      testConnection: async () => {},
      syncPoints: async (points: VectorPoint[]) => {
        syncedPoints.push(...points);
      },
      search: async () => [],
      getVector: async () => null,
      getVectors: async () => new Map(),
      getStoredHashes: async () => storedHashes,
      reconcile: async () => ({ removed: 0 }),
    };

    const result = await syncVaultVectors(fakeApp, DEFAULT_SETTINGS, mockStore);

    // Overview was cached and skipped, Deep Learning was calculated
    expect(result.skippedCount).toBe(1);
    expect(result.syncedCount).toBe(1);
    expect(syncedPoints.length).toBe(1);
    expect(syncedPoints[0].payload.path).toBe("Concepts/Deep Learning.md");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("re-embeds unchanged notes after an embedding model or endpoint switch, then caches again (#164)", async () => {
    const files: TFile[] = [
      { path: "A.md", basename: "A", name: "A.md" } as unknown as TFile,
      { path: "B.md", basename: "B", name: "B.md" } as unknown as TFile,
    ];
    const wasm = readFileSync(resolve(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm"));
    const disk = new Map<string, ArrayBuffer>([
      [".obsidian/plugins/memvector-knowledge-engine/sql-wasm.wasm", wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength)],
    ]);
    const app = {
      vault: {
        configDir: ".obsidian",
        getMarkdownFiles: () => files,
        cachedRead: async (f: TFile) => `Content of ${f.basename}`,
        adapter: {
          exists: async (path: string) => disk.has(path),
          readBinary: async (path: string) => disk.get(path)!,
          writeBinary: async (path: string, data: ArrayBuffer) => void disk.set(path, data),
        },
      },
      secretStorage: { getSecret: () => "" },
    } as unknown as App;

    const fetchSpy = vi.spyOn(fetchEmbeddingModule, "fetchEmbedding").mockResolvedValue({ embedding: [0.1, 0.2, 0.3], error: null });
    const run = async (embeddingModel: string, embeddingApiBaseUrl = DEFAULT_SETTINGS.embeddingApiBaseUrl) => {
      const settings = { ...DEFAULT_SETTINGS, embeddingModel, embeddingApiBaseUrl };
      fetchSpy.mockClear();
      const result = await syncVaultVectors(app, settings, getVectorStore(app, settings));
      return { ...result, calls: fetchSpy.mock.calls.map((c) => c[3]) };
    };

    expect((await run("bge-m3")).syncedCount).toBe(2);
    expect((await run("bge-m3")).skippedCount).toBe(2);

    const switched = await run("nomic-embed-text");
    expect(switched.syncedCount).toBe(2);
    expect(switched.skippedCount).toBe(0);
    expect(switched.calls).toEqual(["nomic-embed-text", "nomic-embed-text"]);
    expect((await run("nomic-embed-text")).skippedCount).toBe(2);

    expect((await run("nomic-embed-text", "http://gpu-box:11434/v1")).syncedCount).toBe(2);
  });
});
