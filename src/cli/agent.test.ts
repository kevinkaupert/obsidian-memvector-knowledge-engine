import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { searchEnvelope, vaultReader } from "./agent";
import { TOOLS, toolList } from "./tools";

describe("agent helpers (knowOS ADR-0014)", () => {
  it("reads notes inside the vault only", () => {
    const base = mkdtempSync(join(tmpdir(), "mv-agent-"));
    const vault = join(base, "vault");
    mkdirSync(join(vault, "wiki"), { recursive: true });
    writeFileSync(join(vault, "wiki", "A.md"), "innen");
    writeFileSync(join(base, "outside.md"), "geheim");
    symlinkSync(join(base, "outside.md"), join(vault, "wiki", "Link.md"));
    const read = vaultReader(vault);
    expect(read("wiki/A.md")).toBe("innen");
    expect(read("wiki/Link.md")).toBeNull();
    expect(read("../outside.md")).toBeNull();
    expect(read("wiki/Fehlt.md")).toBeNull();
  });

  it("wraps a search result and its error in the envelope", () => {
    const ok = searchEnvelope({ outcome: "ok", query: "q", model: "m", fingerprint: "f", indexed: 1, results: [] });
    expect(ok).toEqual({ v: 1, outcome: "ok", data: { query: "q", model: "m", fingerprint: "f", indexed: 1, results: [] } });
    expect(searchEnvelope({ outcome: "error", code: "INDEX_EMPTY", error: "leer" }))
      .toEqual({ v: 1, outcome: "error", error: { code: "INDEX_EMPTY", message: "leer" } });
  });

  it("lists complete tools whose args match their input", () => {
    expect(toolList("0.0.0")).toMatchObject({ v: 1, outcome: "ok", data: { component: "memvector", version: "0.0.0" } });
    for (const tool of TOOLS) {
      expect(tool.description.length).toBeGreaterThan(40);
      const input = tool.input as { properties: Record<string, unknown>; additionalProperties: boolean };
      expect(input.additionalProperties).toBe(false);
      if (!tool.stdin) expect(Object.keys(tool.args).sort()).toEqual(Object.keys(input.properties).sort());
      if (tool.effect === "write") expect(tool.preview && tool.stdin).toBe(true);
    }
  });
});
