import { describe, expect, it } from "vitest";
import { createLabelPlacer, type LabelRect } from "./labelPlacement";

function rect(x1: number, y1: number, x2: number, y2: number): LabelRect {
  return { x1, y1, x2, y2 };
}

describe("createLabelPlacer", () => {
  it("places the first rect and reserves it", () => {
    const placer = createLabelPlacer();
    expect(placer.tryPlace(rect(0, 0, 50, 10))).toBe(true);
    expect(placer.size).toBe(1);
  });

  it("rejects an overlapping rect and reserves nothing for it", () => {
    const placer = createLabelPlacer();
    placer.tryPlace(rect(0, 0, 50, 10));
    expect(placer.tryPlace(rect(40, 5, 90, 15))).toBe(false);
    expect(placer.size).toBe(1);
  });

  it("accepts a rect that only touches edges without overlapping", () => {
    const placer = createLabelPlacer();
    placer.tryPlace(rect(0, 0, 50, 10));
    // x2 === x1 of the placed rect: shared border, zero overlap area.
    expect(placer.tryPlace(rect(50, 0, 100, 10))).toBe(true);
    expect(placer.tryPlace(rect(0, 10, 50, 20))).toBe(true);
  });

  it("force places an overlapping rect and reserves it for later rounds", () => {
    const placer = createLabelPlacer();
    placer.tryPlace(rect(0, 0, 50, 10));
    expect(placer.tryPlace(rect(10, 2, 60, 12), true)).toBe(true);
    expect(placer.size).toBe(2);
    // The forced rect now blocks a third, non-forced label that only hits it.
    expect(placer.tryPlace(rect(52, 2, 58, 12))).toBe(false);
  });

  it("detects overlap across grid cell boundaries", () => {
    const placer = createLabelPlacer();
    // Spans several 96px cells horizontally and vertically.
    placer.tryPlace(rect(80, 80, 300, 120));
    expect(placer.tryPlace(rect(290, 110, 400, 130))).toBe(false);
    expect(placer.tryPlace(rect(310, 130, 400, 150))).toBe(true);
  });

  it("handles negative coordinates (labels panned off the top-left)", () => {
    const placer = createLabelPlacer();
    expect(placer.tryPlace(rect(-200, -150, -120, -140))).toBe(true);
    expect(placer.tryPlace(rect(-130, -145, -60, -135))).toBe(false);
    expect(placer.tryPlace(rect(-119, -145, -60, -135))).toBe(true);
  });

  it("keeps independent state per placer instance (one per frame)", () => {
    const first = createLabelPlacer();
    first.tryPlace(rect(0, 0, 50, 10));
    const second = createLabelPlacer();
    expect(second.tryPlace(rect(0, 0, 50, 10))).toBe(true);
    expect(second.size).toBe(1);
  });

  it("stays fast with many reservations (grid, not a flat scan)", () => {
    const placer = createLabelPlacer();
    // 5000 non-overlapping rects on a wide lattice: a flat O(n^2) scan would do
    // ~12.5M rect comparisons here, the grid does a handful per insert.
    for (let i = 0; i < 5000; i++) {
      const x = (i % 100) * 120;
      const y = Math.floor(i / 100) * 40;
      expect(placer.tryPlace(rect(x, y, x + 100, y + 12))).toBe(true);
    }
    expect(placer.size).toBe(5000);
    expect(placer.tryPlace(rect(0, 0, 100, 12))).toBe(false);
  });
});
