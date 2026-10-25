import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BUILTIN_KIND_COLORS, NEUTRAL_TYPE_COLOR, kindsPathFromKnowos, kindsProblems, noteTypeColor, resolveKindColors } from "./noteKinds";

const CONTRACT = JSON.parse(readFileSync(new URL("./knowos-contract/note-kinds.json", import.meta.url), "utf8"));

describe("note kinds (knowOS ADR-0016)", () => {
  it("the built-in colors are the contract file's", () => {
    expect(kindsProblems(CONTRACT)).toEqual([]);
    expect(BUILTIN_KIND_COLORS.definition).toBe("#6f93c9");
    expect(Object.keys(BUILTIN_KIND_COLORS)).toEqual(["definition", "axiom", "theorem", "proof", "example", "counterexample", "remark"]);
  });

  it("colors: kinds, fixed types, then neutral; old values and untyped notes are neutral", () => {
    expect(noteTypeColor("theorem", BUILTIN_KIND_COLORS)).toBe("#6fae8e");
    expect(noteTypeColor("Proof", BUILTIN_KIND_COLORS)).toBe(BUILTIN_KIND_COLORS.proof);
    expect(noteTypeColor("hub", BUILTIN_KIND_COLORS)).toBe("#c9a25e");
    expect(noteTypeColor("relation", BUILTIN_KIND_COLORS)).toBe("#a897c9");
    expect(noteTypeColor("synthesis", BUILTIN_KIND_COLORS)).toBe("#c98fae");
    for (const t of ["concept", "primitive", "course", "question", "source", "", undefined, "lemma"]) {
      expect(noteTypeColor(t, BUILTIN_KIND_COLORS)).toBe(NEUTRAL_TYPE_COLOR);
    }
  });

  it("a vault file replaces the built-in colors; deprecated kinds keep theirs; a kind without color is neutral", () => {
    const active = resolveKindColors("wiki/kinds.json", { kinds: [
      { type: "lemma", name: "Hilfssatz", color: "#123456" },
      { type: "alt", name: "Alt", color: "#654321", deprecated: true },
      { type: "plain", name: "Plain" },
      { type: "concept", name: "Begriff", color: "#abcdef" },
    ] });
    expect(active.source).toBe("file");
    expect(noteTypeColor("lemma", active.colors)).toBe("#123456");
    expect(noteTypeColor("alt", active.colors)).toBe("#654321");
    expect(noteTypeColor("plain", active.colors)).toBe(NEUTRAL_TYPE_COLOR);
    expect(noteTypeColor("concept", active.colors)).toBe("#abcdef"); // a vault file can color an old value again
    expect(noteTypeColor("definition", active.colors)).toBe(NEUTRAL_TYPE_COLOR); // not in the vault file
  });

  it("an unusable, missing or misnamed file and a broken knowos.json give the built-in colors and a problem", () => {
    for (const data of [{ kinds: 1 }, { kinds: [{ type: "hub", name: "Hub" }] }, { kinds: [{ type: "a", name: "A", color: "red" }] },
      { kinds: [{ type: "a", name: "A" }, { type: "b", name: "a" }] }, "not valid JSON"]) {
      const active = resolveKindColors("k.json", data);
      expect(active.source).toBe("builtin");
      expect(active.problem?.startsWith("k.json: ")).toBe(true);
      expect(active.colors).toEqual(BUILTIN_KIND_COLORS);
    }
    expect(resolveKindColors("k.json", undefined).problem).toBe("k.json does not exist");
    expect(kindsPathFromKnowos(null)).toEqual({ path: null, problem: null });
    expect(kindsPathFromKnowos('{"relation_vocabulary": "p.json"}')).toEqual({ path: null, problem: null });
    expect(kindsPathFromKnowos('{"note_kinds": "wiki/kinds.json"}')).toEqual({ path: "wiki/kinds.json", problem: null });
    expect(kindsPathFromKnowos('{"note_kinds": "../k.json"}').problem).toMatch(/leaves the vault/);
    expect(kindsPathFromKnowos("{nope").problem).toMatch(/knowos.json cannot be read/);
  });
});
