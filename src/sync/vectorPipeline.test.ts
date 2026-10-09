import { afterEach, describe, expect, it, vi } from "vitest";
import { TFile, type App } from "obsidian";

vi.mock("obsidian", () => ({
  requestUrl: vi.fn(),
  TFile: class {},
}));

import { EmbeddingAbortedError, VectorPersistenceError, runVectorPipeline } from "./vectorPipeline";
import type { VectorPoint, VectorStore } from "./vectorStore";
import { DEFAULT_SETTINGS } from "../settings/defaults";
import * as fetchEmbeddingModule from "../llm/fetchEmbedding";
import { EmbeddingTargetChangedError } from "./embeddingTarget";
import { buildEmbeddingInput } from "./embeddingText";

const note = (name: string): TFile => Object.assign(new TFile(), { path: `${name}.md`, basename: name, name: `${name}.md`, stat: { mtime: 42 } });

function fixture(names: string[]) {
  const files = names.map(note);
  const app = {
    vault: {
      getMarkdownFiles: () => files,
      getAbstractFileByPath: (path: string) => files.find((f) => f.path === path) ?? null,
      cachedRead: async (f: TFile) => `Body of ${f.basename}`,
    },
    secretStorage: { getSecret: () => "key" },
  } as unknown as App;
  const synced: VectorPoint[] = [];
  const reconciled: string[][] = [];
  const store = {
    testConnection: async () => {},
    syncPoints: vi.fn(async (points: VectorPoint[]) => { synced.push(...points); }),
    search: async () => [],
    getVector: async () => null,
    getVectors: vi.fn(async () => new Map<string, number[]>()),
    getStoredHashes: vi.fn(async () => new Map<string, { hash: string }>()),
    reconcile: vi.fn(async (paths: string[]) => { reconciled.push(paths); return { removed: 0 }; }),
    flush: vi.fn(async () => {}),
  };
  const paths = files.map((f) => f.path);
  return { app, files, store, graph: store as unknown as VectorStore, synced, reconciled, paths };
}

/** Embedding mock that fails for the given note names and succeeds otherwise. */
function embedFailingFor(...failing: string[]) {
  return vi.spyOn(fetchEmbeddingModule, "fetchEmbedding").mockImplementation(async (text) =>
    failing.some((name) => text.startsWith(name)) ? { embedding: null, error: "429 Too Many Requests" } : { embedding: [1, 0], error: null });
}

const hashOf = (name: string) => buildEmbeddingInput(name, `Body of ${name}`, DEFAULT_SETTINGS.embeddingMaxChars).hash;

describe("runVectorPipeline", () => {
  afterEach(() => vi.restoreAllMocks());

  it("skips a failed note, writes the others with mtime and file name, and reconciles including the failed path", async () => {
    const f = fixture(["A", "B", "C"]);
    embedFailingFor("B");
    const result = await runVectorPipeline(f.app, DEFAULT_SETTINGS, f.graph, { paths: f.paths, reconcilePaths: f.paths });

    expect(result.calculatedCount).toBe(2);
    expect(result.failedPaths).toEqual(["B.md"]);
    expect(f.synced.map((p) => p.payload.path)).toEqual(["A.md", "C.md"]);
    expect(f.synced[0]).toMatchObject({ mtime: 42, payload: { title: "A" } });
    expect(f.reconciled).toEqual([["A.md", "B.md", "C.md"]]);
    expect(f.store.flush).toHaveBeenCalled();
  });

  it("aborts when the first embedding request fails and writes nothing", async () => {
    const f = fixture(["A", "B"]);
    const fetch = embedFailingFor("A");
    const run = runVectorPipeline(f.app, DEFAULT_SETTINGS, f.graph, { paths: f.paths, reconcilePaths: f.paths });

    await expect(run).rejects.toBeInstanceOf(EmbeddingAbortedError);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(f.store.syncPoints).not.toHaveBeenCalled();
    expect(f.store.reconcile).not.toHaveBeenCalled();
  });

  it("aborts after three consecutive errors, still writes earlier vectors, and skips reconcile", async () => {
    const f = fixture(["A", "B", "C", "D", "E"]);
    embedFailingFor("B", "C", "D");
    const err = await runVectorPipeline(f.app, DEFAULT_SETTINGS, f.graph, { paths: f.paths, reconcilePaths: f.paths }).catch((e) => e);

    expect(err).toBeInstanceOf(EmbeddingAbortedError);
    expect((err as EmbeddingAbortedError).partial.failedPaths).toEqual(["B.md", "C.md", "D.md"]);
    expect(f.synced.map((p) => p.payload.path)).toEqual(["A.md"]);
    // A partial run cannot tell which stored vectors are obsolete.
    expect(f.store.reconcile).not.toHaveBeenCalled();
  });

  it("throws EmbeddingTargetChangedError before writing when the model changes mid-run", async () => {
    const f = fixture(["A", "B"]);
    const settings = { ...DEFAULT_SETTINGS };
    vi.spyOn(fetchEmbeddingModule, "fetchEmbedding").mockImplementation(async () => {
      settings.embeddingModel = "other-model";
      return { embedding: [1, 0], error: null };
    });

    await expect(runVectorPipeline(f.app, settings, f.graph, { paths: f.paths, reconcilePaths: f.paths })).rejects.toBeInstanceOf(EmbeddingTargetChangedError);
    expect(f.store.syncPoints).not.toHaveBeenCalled();
    expect(f.store.reconcile).not.toHaveBeenCalled();
    expect(f.store.flush).not.toHaveBeenCalled();
  });

  it("wraps a failing write in VectorPersistenceError carrying the calculated vectors", async () => {
    const f = fixture(["A"]);
    embedFailingFor();
    f.store.syncPoints.mockRejectedValueOnce(new Error("disk full"));
    const err = await runVectorPipeline(f.app, DEFAULT_SETTINGS, f.graph, { paths: f.paths, reconcilePaths: f.paths }).catch((e) => e);

    expect(err).toBeInstanceOf(VectorPersistenceError);
    expect((err as VectorPersistenceError).message).toBe("disk full");
    expect((err as VectorPersistenceError).partial.vectors.get("A.md")).toEqual([1, 0]);
  });

  it("counts a cache hit without a request, and returns its stored vector with collectVectors", async () => {
    const f = fixture(["A"]);
    const fetch = embedFailingFor();
    f.store.getStoredHashes.mockResolvedValue(new Map([["A.md", { hash: hashOf("A") }]]));
    f.store.getVectors.mockResolvedValue(new Map([["A.md", [0, 1]]]));
    const result = await runVectorPipeline(f.app, DEFAULT_SETTINGS, f.graph, { paths: f.paths, reconcilePaths: f.paths, collectVectors: true });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.skippedCount).toBe(1);
    expect(result.vectors.get("A.md")).toEqual([0, 1]);
  });

  it("re-embeds a cache hit whose stored vector is missing when the caller needs the vectors", async () => {
    const f = fixture(["A"]);
    const fetch = embedFailingFor();
    f.store.getStoredHashes.mockResolvedValue(new Map([["A.md", { hash: hashOf("A") }]]));
    const result = await runVectorPipeline(f.app, DEFAULT_SETTINGS, f.graph, { paths: f.paths, reconcilePaths: f.paths, collectVectors: true });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.calculatedCount).toBe(1);
  });

  it("continues without cache when the stored hashes cannot be read, and logs it", async () => {
    const f = fixture(["A"]);
    embedFailingFor();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    f.store.getStoredHashes.mockRejectedValueOnce(new Error("locked"));
    const result = await runVectorPipeline(f.app, DEFAULT_SETTINGS, f.graph, { paths: f.paths, reconcilePaths: f.paths });

    expect(result.calculatedCount).toBe(1);
    expect(warn).toHaveBeenCalled();
  });

  it("counts requested notes whose file is gone as vanished", async () => {
    const f = fixture(["A"]);
    embedFailingFor();
    const result = await runVectorPipeline(f.app, DEFAULT_SETTINGS, f.graph, { paths: ["A.md", "gone.md"], reconcilePaths: ["A.md"] });

    expect(result.vanishedCount).toBe(1);
    expect(result.calculatedCount).toBe(1);
  });
});
