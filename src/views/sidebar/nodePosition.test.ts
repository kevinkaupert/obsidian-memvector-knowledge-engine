import { describe, it, expect } from "vitest";
import type { App } from "obsidian";
import { getNode2DPosition } from "./nodePosition";
import type { NodePositionProvider } from "../vectorScatter/VectorScatterView";
import { MATH_VECTOR_SCATTER_VIEW_TYPE } from "../../constants";

describe("getNode2DPosition", () => {
  it("uses NodePositionProvider when scatter view leaf is available", () => {
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

    const pos = getNode2DPosition(fakeApp, { path: "test.md", name: "test.md", basename: "test" }, "content");
    expect(pos).toEqual({ x: 123, y: 456 });
  });

  it("falls back to deterministic offset when scatter leaf is not open", () => {
    const fakeApp = {
      workspace: {
        getLeavesOfType: () => [],
      },
    } as unknown as App;

    const pos = getNode2DPosition(fakeApp, { path: "fallback.md", name: "fallback.md", basename: "fallback" }, "---\ntype: concept\n---\nHello");
    expect(typeof pos.x).toBe("number");
    expect(typeof pos.y).toBe("number");
  });
});
