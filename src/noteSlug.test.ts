import { describe, expect, it } from "vitest";
import { toSlug } from "./noteSlug";

describe("toSlug", () => {
  it("lowercases and folds German umlauts", () => {
    expect(toSlug("Äquivalenzrelation")).toBe("aequivalenzrelation");
    expect(toSlug("Größe")).toBe("groesse");
    expect(toSlug("Über Mengen")).toBe("ueber-mengen");
  });

  it("collapses non-alphanumeric runs into a single hyphen", () => {
    expect(toSlug("Satz von Bayes (1763)")).toBe("satz-von-bayes-1763");
  });

  it("trims leading/trailing hyphens", () => {
    expect(toSlug("--Foo--")).toBe("foo");
  });

  it("returns an empty string for input with no alphanumeric characters", () => {
    expect(toSlug("???")).toBe("");
  });
});
