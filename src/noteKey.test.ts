import type { App, TFile } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { buildNoteKeyIndex, enableNoteKeyCache, invalidateNoteKeys, isUlid, noteKey } from "./noteKey";
import { pathToId } from "./noteSlug";

const ULID_A = "01J9Z8Q4M5N6P7R8S9T0V1W2X3";
const ULID_B = "01J9Z8Q4M5N6P7R8S9T0V1W2X4";

function vaultApp(notes: Record<string, Record<string, unknown> | null>): App {
  const files = Object.keys(notes).map((path) => ({ path, basename: path.replace(/^.*\//, "").replace(/\.md$/, "") }) as TFile);
  return {
    vault: { getMarkdownFiles: () => files },
    metadataCache: {
      getFileCache: (f: TFile) => (notes[f.path] === null ? null : { frontmatter: notes[f.path] }),
    },
  } as unknown as App;
}

describe("noteKey (ADR-0007)", () => {
  it("accepts ULIDs only", () => {
    expect(isUlid(ULID_A)).toBe(true);
    expect(isUlid(ULID_A.toLowerCase())).toBe(true);
    for (const bad of ["", "my-note", `${ULID_A}0`, "01J9Z8Q4M5N6P7R8S9T0V1W2XU", 42, null]) expect(isUlid(bad)).toBe(false);
  });

  it("keys a note with a valid id by the uppercased id, and others by path", () => {
    const app = vaultApp({
      "a.md": { id: ULID_A.toLowerCase() },
      "Folder/B note.md": {},
      "c.md": { id: "not-a-ulid" },
    });
    expect(noteKey(app, "a.md")).toBe(ULID_A);
    expect(noteKey(app, "Folder/B note.md")).toBe(pathToId("Folder/B note.md"));
    expect(noteKey(app, "c.md")).toBe(pathToId("c.md"));
    expect(noteKey(app, "gone.md")).toBe(pathToId("gone.md"));
  });

  it("gives a duplicated id to the first path only and reports it once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const app = vaultApp({ "z.md": { id: ULID_A }, "copy/a.md": { id: ULID_A }, "b.md": { id: ULID_B } });
    expect(buildNoteKeyIndex(app).duplicates).toEqual([{ id: ULID_A, paths: ["copy/a.md", "z.md"] }]);
    enableNoteKeyCache(app);
    expect(noteKey(app, "copy/a.md")).toBe(ULID_A);
    expect(noteKey(app, "z.md")).toBe(pathToId("z.md"));
    invalidateNoteKeys(app);
    noteKey(app, "z.md");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("marks notes the metadata cache has not parsed yet", () => {
    const index = buildNoteKeyIndex(vaultApp({ "a.md": null, "b.md": {} }));
    expect(index.isKnown("a.md")).toBe(false);
    expect(index.isKnown("b.md")).toBe(true);
  });
});
