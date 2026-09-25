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
      reconcile: async (paths: string[]) => {
        reconciledPaths.push(...paths);
        return { removed: 0 };
      },
    };

    const result = await syncVaultVectors(fakeApp, DEFAULT_SETTINGS, mockStore);

    expect(result.syncedCount).toBe(2);
    expect(syncedPoints.length).toBe(2);

    expect(syncedPoints[0].id).toBe(pathToId("Work/Overview.md"));
    expect(syncedPoints[0].payload.path).toBe("Work/Overview.md");

    expect(syncedPoints[1].id).toBe(pathToId("Concepts/Deep Learning.md"));
    expect(syncedPoints[1].payload.path).toBe("Concepts/Deep Learning.md");

    expect(reconciledPaths).toEqual(["Work/Overview.md", "Concepts/Deep Learning.md"]);
  });
});
