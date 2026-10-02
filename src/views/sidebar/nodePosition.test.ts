import { describe, it, expect, vi, beforeEach } from "vitest";
import type { App } from "obsidian";
import { getNode2DPosition, getNode2DPositions } from "./nodePosition";
import type { NodePositionProvider } from "../vectorScatter/VectorScatterView";
import { MATH_VECTOR_SCATTER_VIEW_TYPE } from "../../constants";

vi.mock("../../sync/sqlite/nodePositions", () => ({ getStoredNodePositions: vi.fn() }));
import { getStoredNodePositions } from "../../sync/sqlite/nodePositions";

beforeEach(() => {
  vi.mocked(getStoredNodePositions).mockReset().mockResolvedValue(new Map());
});

describe("getNode2DPosition", () => {
  it("uses SQLite coordinates when the scatter view is closed (#187)", async () => {
    const app = { workspace: { getLeavesOfType: () => [] } } as unknown as App;
    vi.mocked(getStoredNodePositions).mockResolvedValue(new Map([["test.md", { x: 71, y: -23 }]]));
    expect(await getNode2DPosition(app, { path: "test.md", name: "test.md", basename: "test" }, "text"))
      .toEqual({ x: 71, y: -23 });
    expect(getStoredNodePositions).toHaveBeenCalledWith(app, ["test.md"]);
  });

  it("batches missing coordinates and preserves live positions", async () => {
    const app = { workspace: { getLeavesOfType: () => [{ view: { getNodePosition: (path: string) => path === "a.md" ? { x: 1, y: 2 } : null } }] } } as unknown as App;
    vi.mocked(getStoredNodePositions).mockResolvedValue(new Map([["b.md", { x: 3, y: 4 }], ["c.md", { x: 5, y: 6 }]]));
    const notes = ["a", "b", "c"].map((id) => ({ file: { path: `${id}.md`, name: `${id}.md`, basename: id }, content: "text" }));
    const positions = await getNode2DPositions(app, notes);
    expect([...positions.values()]).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }]);
    expect(getStoredNodePositions).toHaveBeenCalledExactlyOnceWith(app, ["b.md", "c.md"]);
  });

  it("keeps the deterministic approximation when SQLite fails", async () => {
    const app = { workspace: { getLeavesOfType: () => [] } } as unknown as App;
    const file = { path: "test.md", name: "test.md", basename: "test" };
    const expected = await getNode2DPosition(app, file, "text");
    vi.mocked(getStoredNodePositions).mockRejectedValueOnce(new Error("unavailable"));
    expect(await getNode2DPosition(app, file, "text")).toEqual(expected);
  });
  it("uses NodePositionProvider when scatter view leaf is available", async () => {
    const mockProvider: NodePositionProvider = {
      getNodePosition: (path: string) => (path === "test.md" ? { x: 123, y: 456 } : null),
    };

    const fakeApp = {
      workspace: {
        getLeavesOfType: (type: string) => {
          if (type === MATH_VECTOR_SCATTER_VIEW_TYPE) {
            return [{ view: mockProvider }];
          }
          return [];
        },
      },
    } as unknown as App;

    const pos = await getNode2DPosition(fakeApp, { path: "test.md", name: "test.md", basename: "test" }, "content");
    expect(pos).toEqual({ x: 123, y: 456 });
  });

  it("falls back to deterministic offset when scatter leaf is not open", async () => {
    const fakeApp = {
      workspace: {
        getLeavesOfType: () => [],
      },
    } as unknown as App;

    const pos = await getNode2DPosition(fakeApp, { path: "fallback.md", name: "fallback.md", basename: "fallback" }, "---\ntype: concept\n---\nHello");
    expect(typeof pos.x).toBe("number");
    expect(typeof pos.y).toBe("number");
  });
});
