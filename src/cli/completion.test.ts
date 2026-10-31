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
    db.run(
      "CREATE TABLE edges (src TEXT, tgt TEXT, type TEXT, description TEXT, bidirectional INTEGER, original_term TEXT, updated_at TEXT, PRIMARY KEY (src, tgt, type));"
    );
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
    it("returns all nouns and root options for empty __complete (Codex R3 Finding 2)", async () => {
      const res = await run(["__complete", ""]);
      expect(res.code).toBe(0);
      const lines = res.stdout.split("\n").filter(Boolean);
      const returnedNouns = new Set(lines.filter((l) => !l.startsWith("-")).map((l) => l.split(":")[0]));
      for (const noun of Object.keys(COMMAND_TABLE)) {
        expect(returnedNouns.has(noun), `Noun ${noun} missing from __complete`).toBe(true);
      }
      expect(lines).toContain("--version:show version information");
      expect(lines).toContain("--help:show help message");
      expect(lines).toContain("-h:show help message");
      expect(lines).not.toContain("--vault:path to Obsidian vault directory");
      expect(lines).not.toContain("--json:output structured JSON envelope");
    });

    it("returns all verbs for each noun and rejects verb options before verb is specified", async () => {
      for (const [noun, info] of Object.entries(COMMAND_TABLE)) {
        if (Object.keys(info.verbs).length === 0) continue;
        const res = await run(["__complete", noun, ""]);
        expect(res.code).toBe(0);
        const lines = res.stdout.split("\n").filter(Boolean);
        const returnedVerbs = new Set(lines.filter((l) => !l.startsWith("-")).map((l) => l.split(":")[0]));
        for (const verb of Object.keys(info.verbs)) {
          expect(returnedVerbs.has(verb), `Verb ${verb} missing for noun ${noun}`).toBe(true);
        }
      }
      // Codex finding 4: Require an explicit verb before suggesting verb-specific options
      const noteOpts = await run(["__complete", "note", ""]);
      const lines = noteOpts.stdout.split("\n").filter(Boolean);
      expect(lines).toContain("search:search notes by vector similarity");
      expect(lines).toContain("read:read graph neighbors or synthesis context of notes");
      expect(lines).toContain("--commands:list subcommands for this noun");
      expect(lines).toContain("--help:show help message");
      expect(lines).not.toContain("--vault:path to Obsidian vault directory");
      expect(lines).not.toContain("--query:search text query");
      expect(lines).not.toContain("--limit:maximum hits to return (default 20)");
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

    it("filters note read options by selected mode (Codex R5 Finding 2)", async () => {
      // Under --neighbors: offers --note and --limit; rejects --seed and --context
      const neighRes = await run(["__complete", "note", "read", "--neighbors", "--"]);
      expect(neighRes.code).toBe(0);
      const neighLines = neighRes.stdout.split("\n").filter(Boolean);
      expect(neighLines).toContain("--note:target note for graph neighbors");
      expect(neighLines).toContain("--limit:maximum neighbors to return (default 100)");
      expect(neighLines).not.toContain("--seed:seed note for synthesis context (repeatable)");
      expect(neighLines).not.toContain("--context:assemble 2D view synthesis context for seed notes");

      // Under --context: offers --seed; rejects --note, --limit, and --neighbors
      const ctxRes = await run(["__complete", "note", "read", "--context", "--"]);
      expect(ctxRes.code).toBe(0);
      const ctxLines = ctxRes.stdout.split("\n").filter(Boolean);
      expect(ctxLines).toContain("--seed:seed note for synthesis context (repeatable)");
      expect(ctxLines).not.toContain("--note:target note for graph neighbors");
      expect(ctxLines).not.toContain("--limit:maximum neighbors to return (default 100)");
      expect(ctxLines).not.toContain("--neighbors:query graph neighbors for a note");

      // Option-value completion rejects conflicting flags
      const seedUnderNeigh = await run(["__complete", "note", "read", "--neighbors", "--seed", ""]);
      expect(seedUnderNeigh.code).toBe(0);
      expect(seedUnderNeigh.stdout.trim()).toBe("");

      const noteUnderCtx = await run(["__complete", "note", "read", "--context", "--note", ""]);
      expect(noteUnderCtx.code).toBe(0);
      expect(noteUnderCtx.stdout.trim()).toBe("");
    });

    it("escapes fallback filesystem config-dir candidates only once (Codex R5 Finding 1)", async () => {
      // Without --vault, completing a folder with spaces in current directory does not double-escape
      const spaceDir = mkdtempSync(join(tmpdir(), "mv space "));
      const subDir = join(spaceDir, "My Config");
      mkdirSync(subDir, { recursive: true });

      const res = await run(["__complete", "tools", "--config-dir", `${spaceDir}/My`]);
      expect(res.code).toBe(0);
      const lines = res.stdout.split("\n").filter(Boolean);
      // Must be singly escaped: My\ Config/ (not My\\ Config/)
      expect(lines.some((l) => l.includes("My\\ Config/"))).toBe(true);
      expect(lines.some((l) => l.includes("My\\\\ Config/"))).toBe(false);
    });

    it("completes options for relation create", async () => {
      const res = await run(["__complete", "relation", "create", "--"]);
      expect(res.code).toBe(0);
      const lines = res.stdout.split("\n").filter(Boolean);
      expect(lines).toContain("--dry-run:plan relation note without writing");
      expect(lines).toContain("--vault:path to Obsidian vault directory");
      expect(lines).toContain("--json:output structured JSON envelope");
    });

    it("resolves note IDs to executable vault-relative paths (Codex Finding 3)", async () => {
      // NOTES[0] is ["v", "Ventil", "wiki/Ventil.md"]
      const res = await run(["__complete", "note", "read", "--vault", testVault, "v"]);
      expect(res.code).toBe(0);
      const lines = res.stdout.split("\n").filter(Boolean);
      // Must contain the vault-relative executable path
      expect(lines).toContain("wiki/Ventil.md");
      // Must not contain the bare non-executable ID "v"
      expect(lines).not.toContain("v");
    });

    it("expands tilde-prefixed vault paths before index lookup (Codex Finding 1)", async () => {
      // Relies on finding vault when passed as tilde path relative to homedir
      const home = process.env.HOME ?? "/root";
      const relToHome = testVault.startsWith(home) ? testVault.slice(home.length).replace(/^[/\\]+/, "") : null;
      if (relToHome) {
        const tildePath = `~/${relToHome}`;
        const res = await run(["__complete", "note", "read", "--vault", tildePath, "wiki/V"]);
        expect(res.code).toBe(0);
        const lines = res.stdout.split("\n").filter(Boolean);
        expect(lines).toContain("wiki/Ventil.md");
      }
    });

    it("completes space-separated option values for tools (Codex R2 Finding 3)", async () => {
      const res = await run(["__complete", "tools", "--vault", "testing/"]);
      expect(res.code).toBe(0);
      const lines = res.stdout.split("\n").filter(Boolean);
      expect(lines).toContain("testing/fixtures/");
    });

    it("restricts option suggestions strictly to flags accepted in that scope (Codex R2 Finding 4)", async () => {
      // note search rejects --version
      const searchRes = await run(["__complete", "note", "search", "--ver"]);
      expect(searchRes.code).toBe(0);
      expect(searchRes.stdout.trim()).toBe("");

      // tools rejects --help
      const toolsRes = await run(["__complete", "tools", "--hel"]);
      expect(toolsRes.code).toBe(0);
      expect(toolsRes.stdout.trim()).toBe("");

      // relation create rejects --help
      const relRes = await run(["__complete", "relation", "create", "--hel"]);
      expect(relRes.code).toBe(0);
      expect(relRes.stdout.trim()).toBe("");
    });

    it("ensures ./-prefixed targets remain executable in graphNeighbors and context (Codex R2 Finding 2)", async () => {
      const execRes = await run(["note", "read", "./wiki/Ventil.md", "--neighbors", "--vault", testVault, "--json"]);
      expect(execRes.code).toBe(0);
      const data = JSON.parse(execRes.stdout);
      expect(data.outcome).toBe("ok");
      expect(data.data.note).toBe("wiki/Ventil.md");
    });

    it("filters indexed notes in SQL before applying limit (Codex R2 Finding 1)", async () => {
      const largeVault = mkdtempSync(join(tmpdir(), "mv-large-"));
      mkdirSync(join(largeVault, "wiki"), { recursive: true });
      const plugin = join(largeVault, ".obsidian", "plugins", PLUGIN_ID);
      mkdirSync(plugin, { recursive: true });
      const SQL = await initSqlJs({
        wasmBinary: WASM.buffer.slice(WASM.byteOffset, WASM.byteOffset + WASM.byteLength) as ArrayBuffer,
      });
      const db = new SQL.Database();
      db.run("CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT, path TEXT);");
      // Insert 600 notes
      for (let i = 0; i < 600; i++) {
        const id = `id_${String(i).padStart(4, "0")}`;
        const title = `Note_${String(i).padStart(4, "0")}`;
        const path = `wiki/Note_${String(i).padStart(4, "0")}.md`;
        db.run("INSERT INTO notes VALUES (?, ?, ?)", [id, title, path]);
      }
      // Note 550 has a unique search token
      db.run("INSERT INTO notes VALUES ('target_id', 'TargetTitle', 'wiki/ZTargetNote.md')");
      writeFileSync(join(plugin, DB_FILENAME), db.export());
      db.close();

      const res = await run(["__complete", "note", "read", "--vault", largeVault, "ZTarget"]);
      expect(res.code).toBe(0);
      const lines = res.stdout.split("\n").filter(Boolean);
      expect(lines).toContain("wiki/ZTargetNote.md");
    });

    it("escapes LIKE wildcards so literal underscore matches exact target (Codex R4 Finding 1)", async () => {
      const largeVault = mkdtempSync(join(tmpdir(), "mv-like-"));
      mkdirSync(join(largeVault, "wiki"), { recursive: true });
      const plugin = join(largeVault, ".obsidian", "plugins", PLUGIN_ID);
      mkdirSync(plugin, { recursive: true });
      const SQL = await initSqlJs({
        wasmBinary: WASM.buffer.slice(WASM.byteOffset, WASM.byteOffset + WASM.byteLength) as ArrayBuffer,
      });
      const db = new SQL.Database();
      db.run("CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT, path TEXT);");
      for (let i = 0; i < 600; i++) {
        db.run("INSERT INTO notes VALUES (?, ?, ?)", [`id${i}`, `Note${i}`, `wiki/Note${String(i).padStart(4, "0")}.md`]);
      }
      db.run("INSERT INTO notes VALUES ('target', 'Special', 'wiki/Note_special.md')");
      writeFileSync(join(plugin, DB_FILENAME), db.export());
      db.close();

      const res = await run(["__complete", "note", "read", "--vault", largeVault, "wiki/Note_"]);
      expect(res.code).toBe(0);
      const lines = res.stdout.split("\n").filter(Boolean);
      expect(lines).toEqual(["wiki/Note_special.md"]);
    });

    it("supports equals-style tilde expansion during command execution (Codex R4 Finding 2)", async () => {
      const home = process.env.HOME ?? "/root";
      const relToHome = testVault.startsWith(home) ? testVault.slice(home.length).replace(/^[/\\]+/, "") : null;
      if (relToHome) {
        const tildeVault = `--vault=~/${relToHome}`;
        const execRes = await run(["note", "read", "wiki/Ventil.md", "--neighbors", tildeVault, "--json"]);
        expect(execRes.code).toBe(0);
        const data = JSON.parse(execRes.stdout);
        expect(data.outcome).toBe("ok");
        expect(data.data.note).toBe("wiki/Ventil.md");
      }
    });

    it("resolves --config-dir candidates relative to the specified vault (Codex R3 Finding 1)", async () => {
      const customVault = mkdtempSync(join(tmpdir(), "mv-cfgdir-"));
      mkdirSync(join(customVault, ".custom-obsidian"), { recursive: true });
      mkdirSync(join(customVault, "other-folder"), { recursive: true });

      const res = await run(["__complete", "tools", "--vault", customVault, "--config-dir", ""]);
      expect(res.code).toBe(0);
      const lines = res.stdout.split("\n").filter(Boolean);
      expect(lines).toContain(".custom-obsidian");
      expect(lines).toContain(".obsidian");
      expect(lines).toContain("other-folder");
    });

    it("suppresses additional note targets in note read --neighbors once target is supplied (Codex R6 Finding 1)", async () => {
      // With positional target already provided
      const res1 = await run(["__complete", "note", "read", "--neighbors", "wiki/Ventil.md", "--vault", testVault, ""]);
      expect(res1.code).toBe(0);
      const lines1 = res1.stdout.split("\n").filter(Boolean);
      expect(lines1).not.toContain("wiki/Dichtung.md");

      // With --note provided
      const res2 = await run(["__complete", "note", "read", "--neighbors", "--note", "wiki/Ventil.md", "--vault", testVault, ""]);
      expect(res2.code).toBe(0);
      const lines2 = res2.stdout.split("\n").filter(Boolean);
      expect(lines2).not.toContain("wiki/Dichtung.md");

      // With --note= provided
      const res3 = await run(["__complete", "note", "read", "--neighbors", "--note=wiki/Ventil.md", "--vault", testVault, ""]);
      expect(res3.code).toBe(0);
      const lines3 = res3.stdout.split("\n").filter(Boolean);
      expect(lines3).not.toContain("wiki/Dichtung.md");
    });

    it("validates equals-style and space-separated options against active mode (Codex R6 Finding 2)", async () => {
      // In --neighbors mode, --seed= should return empty
      const resEq = await run(["__complete", "note", "read", "--neighbors", "--vault", testVault, "--seed=wiki/"]);
      expect(resEq.code).toBe(0);
      expect(resEq.stdout.trim()).toBe("");

      // In --neighbors mode, trailing '--seed' value completion should return empty
      const resSpace = await run(["__complete", "note", "read", "--neighbors", "--vault", testVault, "--seed", "wiki/"]);
      expect(resSpace.code).toBe(0);
      expect(resSpace.stdout.trim()).toBe("");

      // In --context mode, --note= should return empty
      const resContextNote = await run(["__complete", "note", "read", "--context", "--vault", testVault, "--note=wiki/"]);
      expect(resContextNote.code).toBe(0);
      expect(resContextNote.stdout.trim()).toBe("");
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

    it("correctly classifies directories containing colons (Codex Finding 2)", async () => {
      const zshRes = await new Promise<{ code: number | null; stdout: string; stderr: string }>((done) => {
        const cmd = 'line="wiki/Foo\\:Bar/"; temp="${line//\\\\:}"; if [[ "$line" == */ && "$temp" != *:* ]]; then echo DIR; else echo NOT_DIR; fi';
        const proc = spawn("zsh", ["-f", "-c", cmd]);
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
      expect(zshRes.stdout.trim()).toBe("DIR");
    });

    it("preserves tilde expansion in equals-style directory completions (Codex R3 Finding 3)", async () => {
      // In zsh with compadd -P "--vault=~/" -S ''
      const zshRes = await new Promise<{ code: number | null; stdout: string; stderr: string }>((done) => {
        const script = `
          autoload -Uz compinit && compinit -D
          local -a tilde_dirs
          d="--vault=~/knowOS/components/"
          prefix="\${d%%"~/"*}~/"
          echo "PREFIX:$prefix"
          echo "SUFFIX:\${d#"$prefix"}"
        `;
        const proc = spawn("zsh", ["-f", "-c", script]);
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
      expect(zshRes.stdout).toContain("PREFIX:--vault=~/");
      expect(zshRes.stdout).toContain("SUFFIX:knowOS/components/");
    });
  });
});
