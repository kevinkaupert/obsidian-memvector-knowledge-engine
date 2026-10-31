/**
 * Verification tests for MemVector Shell Completion (knowOS ADR-0017 §10 and Plan 0023 Phase 2b).
 *
 * Success Markers:
 * - M2b.1 (Table Coverage): Every <noun> and <verb> in the dispatcher table is returned by `__complete`.
 * - M2b.2 (Dynamic Candidates, Model-Free & Fast): Golden verification of note paths, folders,
 *   and option values in under 200ms with 0 model calls.
 * - Shell script generation for zsh with robust escaping for spaces and special characters.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import initSqlJs from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import { COMMAND_TABLE, GLOBAL_OPTIONS, VERB_OPTIONS } from "./completion";
import { DB_FILENAME, PLUGIN_ID } from "./search";

const ROOT = process.cwd();
const CLI = resolve(ROOT, "cli.js");
const WASM = readFileSync(resolve(ROOT, "node_modules/sql.js/dist/sql-wasm.wasm"));

const NOTES: Array<[string, string, string]> = [
  ["v", "Ventil", "wiki/Ventil.md"],
  ["d", "Dichtung", "wiki/Dichtung.md"],
  ["g", "Gummi", "wiki/Gummi.md"],
  ["h", "Heizkreis", "wiki/Heizkreis.md"],
  ["p", "Pumpe", "Fragmente/Pumpe.md"],
  ["s", "Special Space", "Fragmente/Special Note with Space.md"],
];

async function createTestVault(withIndex = true): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "mv-complete-"));
  for (const [, title, path] of NOTES) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), `---\ntitle: ${title}\n---\n# ${title}\n`);
  }
  mkdirSync(join(root, "relations"), { recursive: true });
  const plugin = join(root, ".obsidian", "plugins", PLUGIN_ID);
  mkdirSync(plugin, { recursive: true });

  if (withIndex) {
    const SQL = await initSqlJs({
      wasmBinary: WASM.buffer.slice(WASM.byteOffset, WASM.byteOffset + WASM.byteLength) as ArrayBuffer,
    });
    const db = new SQL.Database();
    db.run("CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT, path TEXT);");
    for (const [id, title, path] of NOTES) {
      db.run("INSERT INTO notes VALUES (?, ?, ?)", [id, title, path]);
    }
    writeFileSync(join(plugin, DB_FILENAME), db.export());
    db.close();
  }
  return root;
}

function run(
  args: string[],
  env: Record<string, string> = {}
): Promise<{ code: number | null; stdout: string; stderr: string; elapsed: number }> {
  return new Promise((done) => {
    const t0 = performance.now();
    const child = spawn(process.execPath, [CLI, ...args], { env: { ...process.env, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      stdout += c;
    });
    child.stderr.on("data", (c) => {
      stderr += c;
    });
    child.on("close", (code) => {
      const elapsed = performance.now() - t0;
      done({ code, stdout, stderr, elapsed });
    });
  });
}

describe("memvector CLI shell completion (Plan 0023 Phase 2b)", () => {
  let testVault: string;

  beforeAll(async () => {
    testVault = await createTestVault(true);
  });

  describe("completion script command", () => {
    it("outputs zsh completion script with #compdef memvector", async () => {
      const res = await run(["completion", "zsh"]);
      expect(res.code).toBe(0);
      expect(res.stdout).toContain("#compdef memvector");
      expect(res.stdout).toContain("_memvector()");
      expect(res.stdout).toContain("memvector __complete");
      expect(res.stdout).toContain("compdef _memvector memvector");
    });

    it("defaults to zsh script when shell argument is omitted", async () => {
      const res = await run(["completion"]);
      expect(res.code).toBe(0);
      expect(res.stdout).toContain("#compdef memvector");
    });

    it("shows usage for completion --help", async () => {
      const res = await run(["completion", "--help"]);
      expect(res.code).toBe(0);
      expect(res.stdout).toContain("usage: memvector completion [zsh]");
    });

    it("rejects unsupported shell with exit 2", async () => {
      const res = await run(["completion", "fish"]);
      expect(res.code).toBe(2);
      expect(res.stderr).toContain("unsupported shell 'fish'");
    });
  });

  describe("M2b.1: Table coverage for nouns and verbs", () => {
    it("returns all nouns and global options for empty __complete", async () => {
      const res = await run(["__complete", ""]);
      expect(res.code).toBe(0);
      const lines = res.stdout.split("\n").filter(Boolean);
      const returnedNouns = new Set(lines.filter((l) => !l.startsWith("-")).map((l) => l.split(":")[0]));
      for (const noun of Object.keys(COMMAND_TABLE)) {
        expect(returnedNouns.has(noun), `Noun ${noun} missing from __complete`).toBe(true);
      }
      expect(lines).toContain("--vault:path to Obsidian vault directory");
      expect(lines).toContain("--json:output structured JSON envelope");
    });

    it("returns all verbs for each noun", async () => {
      for (const [noun, info] of Object.entries(COMMAND_TABLE)) {
        const res = await run(["__complete", noun, ""]);
        expect(res.code).toBe(0);
        const lines = res.stdout.split("\n").filter(Boolean);
        const returnedVerbs = new Set(lines.filter((l) => !l.startsWith("-")).map((l) => l.split(":")[0]));
        for (const verb of Object.keys(info.verbs)) {
          expect(returnedVerbs.has(verb), `Verb ${verb} missing for noun ${noun}`).toBe(true);
        }
      }
    });

    it("filters nouns by prefix", async () => {
      const res = await run(["__complete", "not"]);
      expect(res.code).toBe(0);
      const lines = res.stdout.split("\n").filter(Boolean);
      expect(lines).toEqual(["note:commands for notes"]);
    });

    it("returns completion subcommand suggestion", async () => {
      const res = await run(["__complete", "completion", ""]);
      expect(res.code).toBe(0);
      const lines = res.stdout.split("\n").filter(Boolean);
      expect(lines).toEqual(["zsh:zsh completion script"]);
    });

    it("does not offer completion for legacy commands (ADR-0017 §10)", async () => {
      const res = await run(["__complete", "search", ""]);
      expect(res.code).toBe(0);
      expect(res.stdout.trim()).toBe("");

      const resGraph = await run(["__complete", "graph", ""]);
      expect(resGraph.code).toBe(0);
      expect(resGraph.stdout.trim()).toBe("");
    });
  });

  describe("M2b.2: Dynamic candidate completion and performance", () => {
    it("completes note paths from SQLite index in < 200ms", async () => {
      const res = await run(["__complete", "note", "read", "--vault", testVault, ""]);
      expect(res.code).toBe(0);
      expect(res.elapsed).toBeLessThan(200);

      const lines = res.stdout.split("\n").filter(Boolean);
      expect(lines).toContain("wiki/Ventil.md");
      expect(lines).toContain("wiki/Dichtung.md");
      expect(lines).toContain("wiki/Gummi.md");
      expect(lines).toContain("Fragmente/Pumpe.md");
      // Spaces must be properly escaped
      expect(lines).toContain("Fragmente/Special\\ Note\\ with\\ Space.md");
    });

    it("completes note paths matching typed prefix", async () => {
      const res = await run(["__complete", "note", "read", "--vault", testVault, "wiki/V"]);
      expect(res.code).toBe(0);
      const lines = res.stdout.split("\n").filter(Boolean);
      expect(lines).toContain("wiki/Ventil.md");
      expect(lines).not.toContain("wiki/Gummi.md");
    });

    it("preserves ./ relative prefix in target completion", async () => {
      const res = await run(["__complete", "note", "read", "--vault", testVault, "./wiki/V"]);
      expect(res.code).toBe(0);
      const lines = res.stdout.split("\n").filter(Boolean);
      expect(lines).toContain("./wiki/Ventil.md");
    });

    it("completes note paths for --note option", async () => {
      const res = await run(["__complete", "note", "read", "--vault", testVault, "--note", "Fragmente/"]);
      expect(res.code).toBe(0);
      const lines = res.stdout.split("\n").filter(Boolean);
      expect(lines).toContain("Fragmente/Pumpe.md");
      expect(lines).toContain("Fragmente/Special\\ Note\\ with\\ Space.md");
      expect(lines).not.toContain("wiki/Ventil.md");
    });

    it("completes note paths for --seed option", async () => {
      const res = await run(["__complete", "note", "read", "--vault", testVault, "--seed", "wiki/D"]);
      expect(res.code).toBe(0);
      const lines = res.stdout.split("\n").filter(Boolean);
      expect(lines).toContain("wiki/Dichtung.md");
    });

    it("completes folder paths for --folder option", async () => {
      const res = await run(["__complete", "note", "search", "--vault", testVault, "--folder", ""]);
      expect(res.code).toBe(0);
      const lines = res.stdout.split("\n").filter(Boolean);
      expect(lines).toContain("wiki");
      expect(lines).toContain("Fragmente");
      expect(lines).toContain("relations");
    });

    it("completes equals-style option values", async () => {
      const res = await run(["__complete", "note", "search", `--vault=${testVault}`, "--folder=w"]);
      expect(res.code).toBe(0);
      const lines = res.stdout.split("\n").filter(Boolean);
      expect(lines).toContain("--folder=wiki");
    });

    it("completes options for note search", async () => {
      const res = await run(["__complete", "note", "search", "--"]);
      expect(res.code).toBe(0);
      const lines = res.stdout.split("\n").filter(Boolean);
      expect(lines).toContain("--query:search text query");
      expect(lines).toContain("--limit:maximum hits to return (default 20)");
      expect(lines).toContain("--instruction:instruction prefixed to query for embedding");
      expect(lines).toContain("--folder:filter notes by vault folder prefix");
      expect(lines).toContain("--type:filter notes by frontmatter type");
      expect(lines).toContain("--vault:path to Obsidian vault directory");
    });

    it("completes options for note read", async () => {
      const res = await run(["__complete", "note", "read", "--"]);
      expect(res.code).toBe(0);
      const lines = res.stdout.split("\n").filter(Boolean);
      expect(lines).toContain("--neighbors:query graph neighbors for a note");
      expect(lines).toContain("--context:assemble 2D view synthesis context for seed notes");
      expect(lines).toContain("--note:target note for graph neighbors");
      expect(lines).toContain("--seed:seed note for synthesis context (repeatable)");
    });

    it("completes options for relation create", async () => {
      const res = await run(["__complete", "relation", "create", "--"]);
      expect(res.code).toBe(0);
      const lines = res.stdout.split("\n").filter(Boolean);
      expect(lines).toContain("--dry-run:plan relation note without writing");
      expect(lines).toContain("--vault:path to Obsidian vault directory");
      expect(lines).toContain("--json:output structured JSON envelope");
    });

    it("falls back to filesystem scan when SQLite index is missing", async () => {
      const vaultWithoutIndex = await createTestVault(false);
      const res = await run(["__complete", "note", "read", "--vault", vaultWithoutIndex, "wiki/"]);
      expect(res.code).toBe(0);
      const lines = res.stdout.split("\n").filter(Boolean);
      expect(lines).toContain("wiki/Ventil.md");
      expect(lines).toContain("wiki/Dichtung.md");
    });
  });

  describe("Interactive Zsh Completion Simulation", () => {
    it("successfully loads completion script in zsh", async () => {
      const zshRes = await new Promise<{ code: number | null; stdout: string; stderr: string }>((done) => {
        const proc = spawn("zsh", [
          "-f",
          "-c",
          `autoload -Uz compinit && compinit -D && eval "$(${process.execPath} ${CLI} completion zsh)" && which _memvector`,
        ]);
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (d) => {
          stdout += d;
        });
        proc.stderr.on("data", (d) => {
          stderr += d;
        });
        proc.on("close", (code) => done({ code, stdout, stderr }));
      });
      expect(zshRes.code).toBe(0);
      expect(zshRes.stdout).toContain("_memvector");
    });
  });
});
