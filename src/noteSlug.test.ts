import { describe, expect, it } from "vitest";
import { pathToId, toSlug, wikiLinkTarget } from "./noteSlug";

describe("toSlug", () => {
  it("folds umlauts and collapses non-alphanumerics to single dashes", () => {
    expect(toSlug("Körper & Gruppe")).toBe("koerper-gruppe");
  });
});

describe("pathToId", () => {
  it("strips the .md extension before slugging", () => {
    expect(pathToId("Overview.md")).toBe("overview");
  });

  it("gives same-basename notes in different folders distinct ids (F04b)", () => {
    const workId = pathToId("Work/Overview.md");
    const homeId = pathToId("Home/Overview.md");
    expect(workId).not.toBe(homeId);
    expect(workId).toBe("work-overview");
    expect(homeId).toBe("home-overview");
  });

  it("is stable for the same path (idempotent identity)", () => {
    expect(pathToId("wiki/definitions/Alpha.md")).toBe(pathToId("wiki/definitions/Alpha.md"));
  });
});

describe("wikiLinkTarget", () => {
  it("strips the .md extension but keeps the real path, unlike pathToId", () => {
    expect(wikiLinkTarget("wiki/definitions/Alpha.md")).toBe("wiki/definitions/Alpha");
  });

  it("keeps umlauts and casing untouched, unlike pathToId's slug", () => {
    expect(wikiLinkTarget("wiki/Körper/Überblick.md")).toBe("wiki/Körper/Überblick");
  });
});
