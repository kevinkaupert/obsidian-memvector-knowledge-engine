/**
 * Golden tests of today's public CLI (knowOS Plan 0023 phase 1 step 1): every command of the committed `cli.js` runs
 * as a subprocess against a temporary vault with a real index, and its exit code, stdout and stderr are compared with
 * `src/cli/__golden__/<case>.json`. Embeddings come from a local HTTP stub, Jovian's gate from a stub script (the real
 * gate is checked by knowOS's cross-component tests). Only what changes between runs is normalized: the vault path,
 * the stub port, the version, ULIDs and timestamps.
 *
 * A changed output fails here and is either fixed or accepted on purpose: `MEMVECTOR_UPDATE_GOLDEN=1 npx vitest run
 * src/cli/golden.test.ts` rewrites the files; review the diff. Plan 0023 deletes the cases of removed names with them.
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
const GOLDEN = resolve(ROOT, "src/cli/__golden__");
const UPDATE = process.env.MEMVECTOR_UPDATE_GOLDEN === "1";
const VERSION = (JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as { version: string }).version;
const WASM = readFileSync(resolve(ROOT, "node_modules/sql.js/dist/sql-wasm.wasm"));

/** id, title, path, vector (null: in the graph only), frontmatter type */
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

/** A gate stand-in: answers `gate write` like Jovian's gate (a preview when asked), and `gate --version`. */
const GATE = `
const args = process.argv.slice(2);
if (args.includes("--version")) { process.stdout.write(JSON.stringify({ v: 1, outcome: "ok", data: { jovian: "0.0.0", protocol: [1] } })); process.exit(0); }
let input = "";
process.stdin.on("data", (c) => { input += c; });
process.stdin.on("end", () => {
  const req = JSON.parse(input);
  if (process.env.GATE_FAIL) { process.stdout.write(JSON.stringify({ v: 1, outcome: "error", error: { code: "TARGET_EXISTS", message: "Target exists." } })); process.exit(1); }
  if (req.preview) {
    process.stdout.write(JSON.stringify({ v: 1, outcome: "ok", data: { preview: true, preview_id: "p1", writes: [{ target: req.target, action: "create", content: req.content }] } }));
  } else {
    process.stdout.write(JSON.stringify({ v: 1, outcome: "ok", data: { target: req.target, resulting_hash: "h", bytes_written: req.content.length, operation: req.operation } }));
  }
});`;

async function vault(withIndex = true): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "mv-golden-"));
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

function run(args: string[], stdin: string | null, env: Record<string, string> = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
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

function text(value: string, root: string): string {
  return value
    .split(root).join("<VAULT>")
    .split(base).join("<STUB>")
    .split(VERSION).join("<VERSION>")
    .replace(/\b[0-9A-HJKMNP-TV-Z]{26}\b/g, "<ULID>")
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, "<TIME>");
}

function normalize(value: unknown, root: string): unknown {
  if (typeof value === "string") return text(value, root);
  if (Array.isArray(value)) return value.map((v) => normalize(v, root));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v, root)]));
  }
  return value;
}

const RELATION = { v: 1, from: "wiki/Ventil.md", to: "wiki/Dichtung.md", relation: "REQUIRES", text: "Ein Ventil braucht eine Dichtung." };

/** name -> args (after `cli.js`, with <VAULT>), stdin, extra env, embedding status, whether the vault has an index */
const CASES: Record<string, { args: string[]; stdin?: unknown; env?: Record<string, string>; embedding?: number; index?: boolean }> = {
  version: { args: ["--version"] },
  help: { args: ["--help"] },
  no_command: { args: [] },
  unknown_command: { args: ["gibt-es-nicht"] },
  tools: { args: ["tools", "--json"] },
  tools_with_vault: { args: ["tools", "--json", "--vault", "<VAULT>"] },
  search: { args: ["search", "--vault", "<VAULT>", "--query", "Ventil", "--limit", "3", "--json"] },
  search_envelope: { args: ["search", "--vault", "<VAULT>", "--query", "Ventil", "--limit", "3", "--json", "--envelope"] },
  search_folder: { args: ["search", "--vault", "<VAULT>", "--query", "Ventil", "--folder", "Fragmente", "--json"] },
  search_type: { args: ["search", "--vault", "<VAULT>", "--query", "Ventil", "--type", "example", "--json"] },
  search_instruction: { args: ["search", "--vault", "<VAULT>", "--query", "Ventil", "--instruction", "Finde Bauteile", "--limit", "2", "--json"] },
  search_no_index: { args: ["search", "--vault", "<VAULT>", "--query", "Ventil", "--json"], index: false },
  search_no_index_envelope: { args: ["search", "--vault", "<VAULT>", "--query", "Ventil", "--json", "--envelope"], index: false },
  search_embedding_error: { args: ["search", "--vault", "<VAULT>", "--query", "Ventil", "--json"], embedding: 500 },
  search_usage: { args: ["search", "--vault", "<VAULT>", "--json"] },
  graph_neighbors: { args: ["graph", "neighbors", "--vault", "<VAULT>", "--note", "wiki/Ventil.md", "--json"] },
  graph_neighbors_unknown: { args: ["graph", "neighbors", "--vault", "<VAULT>", "--note", "wiki/Gibt-es-nicht.md", "--json"] },
  graph_usage: { args: ["graph", "kanten", "--vault", "<VAULT>"] },
  context: { args: ["context", "--vault", "<VAULT>", "--seed", "wiki/Ventil.md", "--json"] },
  context_two_seeds: { args: ["context", "--vault", "<VAULT>", "--seed", "wiki/Ventil.md", "--seed", "wiki/Gummi.md", "--json"] },
  context_usage: { args: ["context", "--vault", "<VAULT>", "--json"] },
  relation_add: { args: ["relation", "add", "--vault", "<VAULT>", "--json"], stdin: RELATION },
  relation_add_preview: { args: ["relation", "add", "--vault", "<VAULT>", "--json"], stdin: { ...RELATION, preview: true } },
  relation_add_envelope: { args: ["relation", "add", "--vault", "<VAULT>", "--json", "--envelope"], stdin: RELATION },
  relation_add_gate_error: { args: ["relation", "add", "--vault", "<VAULT>", "--json"], stdin: RELATION, env: { GATE_FAIL: "1" } },
  relation_add_bad_request: { args: ["relation", "add", "--vault", "<VAULT>", "--json"], stdin: "kein json" },
};

describe("memvector CLI goldens (knowOS Plan 0023 phase 1)", () => {
  it("has a committed cli.js", () => {
    expect(existsSync(CLI)).toBe(true);
  });

  for (const [name, c] of Object.entries(CASES)) {
    it(name, async () => {
      const root = await vault(c.index !== false);
      embeddingStatus = c.embedding ?? 200;
      const args = c.args.map((a) => a.split("<VAULT>").join(root));
      const stdin = c.stdin === undefined ? null : typeof c.stdin === "string" ? c.stdin : JSON.stringify(c.stdin);
      const out = await run(args, stdin, c.env);
      let stdout: unknown;
      try {
        stdout = JSON.parse(out.stdout);
      } catch {
        stdout = out.stdout;
      }
      const actual = { args: c.args, exit: out.code, stdout: normalize(stdout, root), stderr: text(out.stderr, root) };
      const path = join(GOLDEN, `${name}.json`);
      if (UPDATE) {
        mkdirSync(GOLDEN, { recursive: true });
        writeFileSync(path, `${JSON.stringify(actual, null, 2)}\n`);
      }
      expect(existsSync(path), `no golden for ${name}; run with MEMVECTOR_UPDATE_GOLDEN=1 and review it`).toBe(true);
      expect(actual).toEqual(JSON.parse(readFileSync(path, "utf8")));
    }, 30_000);
  }
});
