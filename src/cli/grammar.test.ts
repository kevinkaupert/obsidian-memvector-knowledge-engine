/**
 * Golden / verification tests of the new `<noun> <verb>` CLI grammar (knowOS Plan 0023 Phase 2a, ADR-0017):
 * Tests note search, note read (--neighbors, --context), relation create, subcommands introspection (--commands),
 * and approved differences from section 5 (envelope output by default under --json, exit codes 0, 1, 2, 3).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import initSqlJs from "sql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveEmbeddingTarget } from "../sync/embeddingTarget";
import { DB_FILENAME, PLUGIN_ID } from "./search";

const ROOT = process.cwd();
const CLI = resolve(ROOT, "cli.js");
const VERSION = (JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as { version: string }).version;
const WASM = readFileSync(resolve(ROOT, "node_modules/sql.js/dist/sql-wasm.wasm"));

const NOTES: Array<[string, string, string, number[] | null, string]> = [
  ["v", "Ventil", "wiki/Ventil.md", [1, 0, 0], "concept"],
  ["d", "Dichtung", "wiki/Dichtung.md", [0, 1, 0], "concept"],
  ["g", "Gummi", "wiki/Gummi.md", [0, 0, 1], "example"],
  ["h", "Heizkreis", "wiki/Heizkreis.md", [0.95, 0.05, 0], "concept"],
  ["p", "Pumpe", "Fragmente/Pumpe.md", [0.9, 0.1, 0], "definition"],
];

let stub: Server;
let base = "";
let embeddingStatus = 200;

beforeAll(async () => {
  stub = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.writeHead(embeddingStatus, { "Content-Type": "application/json" });
      res.end(embeddingStatus === 200 ? JSON.stringify({ data: [{ embedding: [0.9, 0.1, 0] }] }) : "{}");
    });
  });
  await new Promise<void>((done) => stub.listen(0, "127.0.0.1", done));
  const address = stub.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/v1`;
});

afterAll(() => new Promise<void>((done) => stub.close(() => done())));

const GATE = `
const args = process.argv.slice(2);
if (args.includes("--version")) { process.stdout.write(JSON.stringify({ v: 1, outcome: "ok", data: { jovian: "0.0.0", protocol: [1] } })); process.exit(0); }
let input = "";
process.stdin.on("data", (c) => { input += c; });
process.stdin.on("end", () => {
  const req = JSON.parse(input);
  if (process.env.GATE_FAIL) { process.stdout.write(JSON.stringify({ v: 1, outcome: "error", error: { code: "TARGET_EXISTS", message: "Target exists." } })); process.exit(1); }
  if (process.env.GATE_TIMEOUT) { process.stdout.write(JSON.stringify({ v: 1, outcome: "timeout", error: { code: "LOCK_TIMEOUT", message: "Lock acquisition timed out." } })); process.exit(3); }
  if (req.preview) {
    process.stdout.write(JSON.stringify({ v: 1, outcome: "ok", data: { preview: true, preview_id: "p1", writes: [{ target: req.target, action: "create", content: req.content }] } }));
  } else {
    process.stdout.write(JSON.stringify({ v: 1, outcome: "ok", data: { target: req.target, resulting_hash: "h", bytes_written: req.content.length, operation: req.operation } }));
  }
});`;

async function vault(withIndex = true): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "mv-grammar-"));
  for (const [, title, path, , type] of NOTES) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), `---\ntitle: ${title}\ntype: ${type}\n---\n# ${title}\n\nText über ${title} und seine Teile.\n`);
  }
  mkdirSync(join(root, "relations"));
  const plugin = join(root, ".obsidian", "plugins", PLUGIN_ID);
  mkdirSync(plugin, { recursive: true });
  writeFileSync(join(root, "gate.js"), GATE);
  const settings = { embeddingModel: "bge-m3", embeddingApiBaseUrl: base, jovianCommand: `node ${join(root, "gate.js")}` };
  writeFileSync(join(plugin, "data.json"), JSON.stringify(settings));
  if (!withIndex) return root;
  const fingerprint = resolveEmbeddingTarget(settings).fingerprint;
  const SQL = await initSqlJs({ wasmBinary: WASM.buffer.slice(WASM.byteOffset, WASM.byteOffset + WASM.byteLength) as ArrayBuffer });
  const db = new SQL.Database();
  db.run(`CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT, path TEXT);
          CREATE TABLE edges (src TEXT, tgt TEXT, type TEXT, description TEXT, bidirectional INTEGER,
            original_term TEXT, updated_at TEXT, PRIMARY KEY (src, tgt, type));
          CREATE TABLE vectors (id TEXT PRIMARY KEY, path TEXT, title TEXT, content TEXT, vector TEXT,
            content_hash TEXT, mtime INTEGER, embedding_fingerprint TEXT);`);
  for (const [id, title, path, vector] of NOTES) {
    db.run("INSERT INTO notes VALUES (?, ?, ?)", [id, title, path]);
    if (vector) db.run("INSERT INTO vectors VALUES (?, ?, ?, ?, ?, '', 0, ?)", [id, path, title, `Text über ${title}.`, JSON.stringify(vector), fingerprint]);
  }
  db.run("INSERT INTO edges VALUES ('v', 'd', 'REQUIRES', 'braucht eine Dichtung', 0, NULL, '')");
  db.run("INSERT INTO edges VALUES ('d', 'g', 'REQUIRES', '', 0, NULL, '')");
  db.run("INSERT INTO edges VALUES ('h', 'v', 'EXAMPLE_OF', '', 0, NULL, '')");
  writeFileSync(join(plugin, DB_FILENAME), db.export());
  db.close();
  return root;
}

function run(args: string[], stdin: string | null = null, env: Record<string, string> = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [CLI, ...args], { env: { ...process.env, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (d: string) => { stdout += d; });
    child.stderr.setEncoding("utf8").on("data", (d: string) => { stderr += d; });
    child.on("close", (code) => done({ code, stdout, stderr }));
    child.stdin.end(stdin ?? "");
  });
}

const RELATION = { v: 1, from: "wiki/Ventil.md", to: "wiki/Dichtung.md", relation: "REQUIRES", text: "Ein Ventil braucht eine Dichtung." };

describe("memvector CLI grammar migration (knowOS Plan 0023 Phase 2a)", () => {
  it("note --commands lists search and read", async () => {
    const res = await run(["note", "--commands"]);
    expect(res.code).toBe(0);
    expect(JSON.parse(res.stdout)).toEqual({ commands: ["search", "read"] });
  });

  it("relation --commands lists create and add", async () => {
    const res = await run(["relation", "--commands"]);
    expect(res.code).toBe(0);
    expect(JSON.parse(res.stdout)).toEqual({ commands: ["create", "add"] });
  });

  it("--version --json outputs version envelope", async () => {
    const res = await run(["--version", "--json"]);
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.v).toBe(1);
    expect(parsed.outcome).toBe("ok");
    expect(parsed.data.memvector).toBe(VERSION);
  });

  it("note without subcommand exits with 2", async () => {
    const res = await run(["note"]);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain("note takes 'search' or 'read'");
  });

  it("note --help exits 0", async () => {
    const res = await run(["note", "--help"]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("usage: memvector note");
  });

  it("relation --help exits 0", async () => {
    const res = await run(["relation", "--help"]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("usage: memvector relation");
  });

  it("note unknown subcommand exits with 2", async () => {
    const res = await run(["note", "unknown"]);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain("unknown note command 'unknown'");
  });

  describe("note search", () => {
    it("searches with positional query and returns envelope under --json", async () => {
      const root = await vault();
      const res = await run(["note", "search", "Ventil", "--vault", root, "--limit", "3", "--json"]);
      expect(res.code).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.v).toBe(1);
      expect(parsed.outcome).toBe("ok");
      expect(parsed.data.query).toBe("Ventil");
      expect(parsed.data.results.length).toBeGreaterThan(0);
    });

    it("searches in human mode without --json", async () => {
      const root = await vault();
      const res = await run(["note", "search", "Ventil", "--vault", root, "--limit", "3"]);
      expect(res.code).toBe(0);
      expect(res.stdout).toContain("Ventil");
      expect(res.stdout).toContain("[score:");
    });

    it("filters search by folder", async () => {
      const root = await vault();
      const res = await run(["note", "search", "Pumpe", "--vault", root, "--folder", "Fragmente", "--json"]);
      expect(res.code).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.outcome).toBe("ok");
      expect(parsed.data.results.every((r: { path: string }) => r.path.startsWith("Fragmente"))).toBe(true);
    });

    it("filters search by frontmatter type", async () => {
      const root = await vault();
      const res = await run(["note", "search", "Gummi", "--vault", root, "--type", "example", "--json"]);
      expect(res.code).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.outcome).toBe("ok");
      expect(parsed.data.results.length).toBe(1);
      expect(parsed.data.results[0].title).toBe("Gummi");
    });

    it("handles missing index with error envelope", async () => {
      const root = await vault(false);
      const res = await run(["note", "search", "Ventil", "--vault", root, "--json"]);
      expect(res.code).toBe(1);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.v).toBe(1);
      expect(parsed.outcome).toBe("error");
      expect(parsed.error.code).toBe("INDEX_MISSING");
    });

    it("rejects search without query with exit 2", async () => {
      const root = await vault();
      const res = await run(["note", "search", "--vault", root, "--json"]);
      expect(res.code).toBe(2);
      expect(res.stderr).toContain("note search requires a query");
    });

    it("rejects search without vault with exit 2", async () => {
      const res = await run(["note", "search", "Ventil", "--json"]);
      expect(res.code).toBe(2);
      expect(res.stderr).toContain("--vault is required");
    });

    it("rejects query positional argument together with --query with exit 2", async () => {
      const root = await vault();
      const res = await run(["note", "search", "Ventil", "--query", "Dichtung", "--vault", root]);
      expect(res.code).toBe(2);
      expect(res.stderr).toContain("cannot specify both a query positional argument and --query");
    });

    it("rejects --envelope on note search with exit 2", async () => {
      const root = await vault();
      const res = await run(["note", "search", "Ventil", "--vault", root, "--envelope"]);
      expect(res.code).toBe(2);
      expect(res.stderr).toContain("unknown option --envelope");
    });
  });

  describe("note read --neighbors", () => {
    it("reads neighbors with positional target and returns envelope under --json", async () => {
      const root = await vault();
      const res = await run(["note", "read", "wiki/Ventil.md", "--neighbors", "--vault", root, "--json"]);
      expect(res.code).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.v).toBe(1);
      expect(parsed.outcome).toBe("ok");
      expect(parsed.data.note).toBe("wiki/Ventil.md");
      expect(parsed.data.neighbors.length).toBeGreaterThan(0);
    });

    it("reads neighbors in human mode", async () => {
      const root = await vault();
      const res = await run(["note", "read", "wiki/Ventil.md", "--neighbors", "--vault", root]);
      expect(res.code).toBe(0);
      expect(res.stdout).toContain("Neighbors of Ventil (wiki/Ventil.md):");
      expect(res.stdout).toContain("[REQUIRES]");
    });

    it("returns error envelope for unknown note", async () => {
      const root = await vault();
      const res = await run(["note", "read", "wiki/Unknown.md", "--neighbors", "--vault", root, "--json"]);
      expect(res.code).toBe(1);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.v).toBe(1);
      expect(parsed.outcome).toBe("error");
      expect(parsed.error.code).toBe("NOTE_NOT_INDEXED");
    });

    it("rejects neighbors call without note target with exit 2", async () => {
      const root = await vault();
      const res = await run(["note", "read", "--neighbors", "--vault", root]);
      expect(res.code).toBe(2);
      expect(res.stderr).toContain("--note is required");
    });

    it("rejects multiple positional targets with exit 2", async () => {
      const root = await vault();
      const res = await run(["note", "read", "wiki/Ventil.md", "wiki/Dichtung.md", "--neighbors", "--vault", root]);
      expect(res.code).toBe(2);
      expect(res.stderr).toContain("note read --neighbors takes at most one note");
    });

    it("rejects both positional target and --note with exit 2", async () => {
      const root = await vault();
      const res = await run(["note", "read", "wiki/Ventil.md", "--note", "wiki/Dichtung.md", "--neighbors", "--vault", root]);
      expect(res.code).toBe(2);
      expect(res.stderr).toContain("cannot specify both a note positional argument and --note");
    });

    it("rejects --seed option under --neighbors with exit 2", async () => {
      const root = await vault();
      const res = await run(["note", "read", "wiki/Ventil.md", "--neighbors", "--seed", "wiki/Dichtung.md", "--vault", root]);
      expect(res.code).toBe(2);
      expect(res.stderr).toContain("unknown option --seed");
    });

    it("rejects --envelope under --neighbors with exit 2", async () => {
      const root = await vault();
      const res = await run(["note", "read", "wiki/Ventil.md", "--neighbors", "--vault", root, "--envelope"]);
      expect(res.code).toBe(2);
      expect(res.stderr).toContain("unknown option --envelope");
    });
  });

  describe("note read --context", () => {
    it("assembles context for positional seed and returns envelope under --json", async () => {
      const root = await vault();
      const res = await run(["note", "read", "wiki/Ventil.md", "--context", "--vault", root, "--json"]);
      expect(res.code).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.v).toBe(1);
      expect(parsed.outcome).toBe("ok");
      expect(parsed.data.seeds).toEqual([{ path: "wiki/Ventil.md", title: "Ventil" }]);
      expect(parsed.data.hits.length).toBeGreaterThan(0);
    });

    it("assembles context for multiple positional seeds", async () => {
      const root = await vault();
      const res = await run(["note", "read", "wiki/Ventil.md", "wiki/Gummi.md", "--context", "--vault", root, "--json"]);
      expect(res.code).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.v).toBe(1);
      expect(parsed.outcome).toBe("ok");
      expect(parsed.data.seeds.length).toBe(2);
    });

    it("reads context in human mode", async () => {
      const root = await vault();
      const res = await run(["note", "read", "wiki/Ventil.md", "--context", "--vault", root]);
      expect(res.code).toBe(0);
      expect(res.stdout).toContain("Context for seeds: Ventil (wiki/Ventil.md)");
      expect(res.stdout).toContain("Hits (");
    });

    it("rejects context without seed with exit 2", async () => {
      const root = await vault();
      const res = await run(["note", "read", "--context", "--vault", root]);
      expect(res.code).toBe(2);
      expect(res.stderr).toContain("at least one seed note is required");
    });

    it("rejects dangling --seed with exit 2", async () => {
      const root = await vault();
      const res = await run(["note", "read", "--context", "--vault", root, "--seed"]);
      expect(res.code).toBe(2);
      expect(res.stderr).toContain("--seed needs a note");
    });

    it("rejects --envelope under --context with exit 2", async () => {
      const root = await vault();
      const res = await run(["note", "read", "wiki/Ventil.md", "--context", "--vault", root, "--envelope"]);
      expect(res.code).toBe(2);
      expect(res.stderr).toContain("unknown option --envelope");
    });
  });

  describe("note read validation", () => {
    it("rejects note read without --neighbors or --context with exit 2", async () => {
      const root = await vault();
      const res = await run(["note", "read", "wiki/Ventil.md", "--vault", root]);
      expect(res.code).toBe(2);
      expect(res.stderr).toContain("note read requires --neighbors or --context");
    });

    it("rejects note read with both --neighbors and --context with exit 2", async () => {
      const root = await vault();
      const res = await run(["note", "read", "wiki/Ventil.md", "--neighbors", "--context", "--vault", root]);
      expect(res.code).toBe(2);
      expect(res.stderr).toContain("note read cannot take both --neighbors and --context");
    });
  });

  describe("relation create", () => {
    it("creates relation note and returns envelope under --json", async () => {
      const root = await vault();
      const res = await run(["relation", "create", "--vault", root, "--json"], JSON.stringify(RELATION));
      expect(res.code).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.v).toBe(1);
      expect(parsed.outcome).toBe("ok");
      expect(parsed.data.created).toBe(true);
      expect(parsed.data.path).toContain("relations/");
    });

    it("creates relation preview with --dry-run", async () => {
      const root = await vault();
      const res = await run(["relation", "create", "--vault", root, "--dry-run", "--json"], JSON.stringify(RELATION));
      expect(res.code).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.v).toBe(1);
      expect(parsed.outcome).toBe("ok");
      expect(parsed.data.preview).toBeDefined();
    });

    it("creates relation in human mode", async () => {
      const root = await vault();
      const res = await run(["relation", "create", "--vault", root], JSON.stringify(RELATION));
      expect(res.code).toBe(0);
      expect(res.stdout).toContain("Relation created:");
    });

    it("handles invalid JSON on stdin with exit 1", async () => {
      const root = await vault();
      const res = await run(["relation", "create", "--vault", root, "--json"], "invalid json");
      expect(res.code).toBe(1);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.v).toBe(1);
      expect(parsed.outcome).toBe("error");
      expect(parsed.error.code).toBe("INVALID_REQUEST");
    });

    it("handles gate error with exit 1", async () => {
      const root = await vault();
      const res = await run(["relation", "create", "--vault", root, "--json"], JSON.stringify(RELATION), { GATE_FAIL: "1" });
      expect(res.code).toBe(1);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.v).toBe(1);
      expect(parsed.outcome).toBe("error");
      expect(parsed.error.code).toBe("TARGET_EXISTS");
    });

    it("rejects relation unknown subcommand with exit 2", async () => {
      const root = await vault();
      const res = await run(["relation", "unknown", "--vault", root]);
      expect(res.code).toBe(2);
      expect(res.stderr).toContain("unknown relation command 'unknown'");
    });

    it("rejects --dry-run with preview: false in request with exit 2", async () => {
      const root = await vault();
      const res = await run(["relation", "create", "--vault", root, "--dry-run"], JSON.stringify({ ...RELATION, preview: false }));
      expect(res.code).toBe(2);
      expect(res.stderr).toContain("cannot specify --dry-run with 'preview': false");
    });

    it("rejects --envelope on relation create with exit 2", async () => {
      const root = await vault();
      const res = await run(["relation", "create", "--vault", root, "--envelope"], JSON.stringify(RELATION));
      expect(res.code).toBe(2);
      expect(res.stderr).toContain("unknown option --envelope");
    });

    it("handles gate lock timeout with exit 3 and timeout envelope", async () => {
      const root = await vault();
      const res = await run(["relation", "create", "--vault", root, "--json"], JSON.stringify(RELATION), { GATE_TIMEOUT: "1" });
      expect(res.code).toBe(3);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.outcome).toBe("timeout");
      expect(parsed.error.code).toBe("LOCK_TIMEOUT");
    });

    it("prints error to stderr in human mode without --json on invalid stdin", async () => {
      const root = await vault();
      const res = await run(["relation", "create", "--vault", root], "invalid json");
      expect(res.code).toBe(1);
      expect(res.stderr).toContain("[ERROR] stdin is not one JSON request.");
      expect(res.stdout).toBe("");
    });
  });
});
