import { beforeEach, describe, expect, it, vi } from "vitest";
import { TFile, type App } from "obsidian";
import { DEFAULT_SETTINGS } from "../../settings/defaults";
import { getVectorStore } from "../../sync/storeFactory";
import { findVectorNeighbors, loadRadarNeighbors } from "./radarNeighbors";

vi.mock("obsidian", () => ({ TFile: class {} }));
vi.mock("../../sync/storeFactory", () => ({ getVectorStore: vi.fn() }));

const getVector = vi.fn();
const search = vi.fn();
const file = (id: string): TFile => Object.assign(new TFile(), { path: `${id}.md`, name: `${id}.md`, basename: id });
const active = file("active");
const candidates = [file("c"), file("b"), file("a")];
const app = {
  vault: {
    getMarkdownFiles: () => [active, ...candidates],
    getAbstractFileByPath: (path: string) => [active, ...candidates].find((item) => item.path === path),
    cachedRead: vi.fn(async () => "shared words"),
  },
  metadataCache: { getFileCache: () => ({}) },
} as unknown as App;

beforeEach(() => {
  vi.clearAllMocks();
  getVector.mockReset().mockResolvedValue([1, 0]);
  search.mockReset().mockResolvedValue([]);
  vi.mocked(getVectorStore).mockReturnValue({ getVector, search } as unknown as ReturnType<typeof getVectorStore>);
});

describe("radar retrieval status (#193)", () => {
  it("keeps successful empty semantic results when no other candidates exist in vault", async () => {
    const singleFileApp = {
      ...app,
      vault: { ...app.vault, getMarkdownFiles: () => [active] },
    } as unknown as App;
    expect(await loadRadarNeighbors(singleFileApp, DEFAULT_SETTINGS, active, "shared words", 10))
      .toEqual({ status: "ready", data: [] });
    expect(app.vault.cachedRead).not.toHaveBeenCalled();
  });

  it("reports unindexed and falls back to heuristic scoring when other candidates exist but have no vectors", async () => {
    const result = await loadRadarNeighbors(app, DEFAULT_SETTINGS, active, "shared words", 10);
    expect(result.status).toBe("unindexed");
    expect(result.data).toHaveLength(3);
    expect(app.vault.cachedRead).toHaveBeenCalled();
  });

  it("labels missing embeddings as unindexed and ranks fallback ties by path", async () => {
    getVector.mockResolvedValue(null);
    const result = await loadRadarNeighbors(app, DEFAULT_SETTINGS, active, "shared words", 2);
    expect(result.status).toBe("unindexed");
    expect(result.data.map((note) => note.file.path)).toEqual(["a.md", "b.md"]);
    expect(search).not.toHaveBeenCalled();
  });

  it.each(["lookup", "search"])("retains an error indicator after a failed %s and heuristic fallback", async (stage) => {
    (stage === "lookup" ? getVector : search).mockRejectedValue(new Error("store unavailable"));
    const result = await loadRadarNeighbors(app, DEFAULT_SETTINGS, active, "shared words", 10);
    expect(result.status).toBe("error");
    expect(result.data).toHaveLength(3);
  });

  it("returns semantic hits without heuristic fallback", async () => {
    search.mockResolvedValue([{ score: 0.95, payload: { path: "b.md", title: "B", content: "body" } }]);
    const result = await findVectorNeighbors(app, DEFAULT_SETTINGS, active, 10);
    expect(result.status).toBe("ready");
    expect(result.data[0]).toMatchObject({ file: candidates[1], score: 0.95 });
  });
});
