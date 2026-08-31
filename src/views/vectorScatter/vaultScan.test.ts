import { describe, expect, it } from "vitest";
import { shouldIncludeFile } from "./vaultScan";
import type { TFile } from "obsidian";

function file(path: string): TFile {
  const basename = path.split("/").pop()!.replace(/\.md$/, "");
  return { path, name: `${basename}.md`, basename } as TFile;
}

// Regression guard: the default exclusion string ("-path: schema ...", with
// a space after the colon) split "-path:" and "schema" into two separate
// tokens. "-path:" alone excludes nothing (empty term), and the bare word
// "schema" became a *positive* inclusion rule - since it was the only
// positive rule, EVERY note without "schema" in its path/name got excluded.
// Only ~11 notes (whatever lived under a literal schema/ folder) survived
// instead of the whole vault. Fixed by removing the space; this test pins
// the correct (no-space) syntax against that regression.
const DEFAULT_EXCLUSIONS = "-path:schema -file:index -file:log -file:README -file:AGENTS -file:PROFILE -file:canvas- -file:Beweistricks";

describe("shouldIncludeFile with the default exclusion string", () => {
  it("includes an ordinary note that has nothing to do with 'schema'", () => {
    expect(shouldIncludeFile(file("wiki/definitions/koerper.md"), DEFAULT_EXCLUSIONS)).toBe(true);
  });

  it("still excludes notes actually under a schema/ path", () => {
    expect(shouldIncludeFile(file("schema/FRONTMATTER-SCHEMA.md"), DEFAULT_EXCLUSIONS)).toBe(false);
  });

  it("still excludes housekeeping files by name", () => {
    expect(shouldIncludeFile(file("wiki/README.md"), DEFAULT_EXCLUSIONS)).toBe(false);
    expect(shouldIncludeFile(file("meta/log.md"), DEFAULT_EXCLUSIONS)).toBe(false);
  });
});
