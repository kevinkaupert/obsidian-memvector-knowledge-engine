import { describe, it, expect } from "vitest";
import { hashString } from "./hash";

describe("hashString", () => {
  it("produces deterministic integer hashes", () => {
    const h1 = hashString("hello world");
    const h2 = hashString("hello world");
    expect(h1).toBe(h2);
    expect(Number.isInteger(h1)).toBe(true);
  });

  it("produces different hashes for different inputs", () => {
    expect(hashString("note A")).not.toBe(hashString("note B"));
  });
});
