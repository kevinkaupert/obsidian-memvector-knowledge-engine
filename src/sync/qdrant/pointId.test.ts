import { describe, expect, it } from "vitest";
import { pointIdForPath } from "./pointId";

describe("pointIdForPath", () => {
  it("is deterministic for the same path", () => {
    expect(pointIdForPath("wiki/definitions/koerper.md")).toBe(pointIdForPath("wiki/definitions/koerper.md"));
  });

  it("differs for different paths", () => {
    expect(pointIdForPath("a.md")).not.toBe(pointIdForPath("b.md"));
  });

  it("is always non-negative", () => {
    for (const p of ["", "a", "a very long path/with/many/segments/and-a-file.md"]) {
      expect(pointIdForPath(p)).toBeGreaterThanOrEqual(0);
    }
  });
});
