import { spawn as nodeSpawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getEmbeddedWasmBinary } from "../sync/sqlite/embeddedWasm";
import type { EmbeddingPost } from "../llm/embeddingRequest";
import type { GateSpawn } from "../noteWriter/jovianGate";
import { relationAdd } from "./relation";
import { searchEnvelope, vaultReader } from "./agent";
import { graphNeighbors } from "./graph";
import { DB_FILENAME, PLUGIN_ID, searchIndex } from "./search";
import { contextFor } from "./context";
import { migrateSettings } from "../settings/secrets";
import { toolList } from "./tools";
import { complete, ZSH_SCRIPT } from "./completion";

declare const MEMVECTOR_VERSION: string;

const USAGE = `usage: memvector search --vault <path> --query <text> [--limit 20] [--instruction <text>] [--folder <folder>] [--type <type>] [--config-dir .obsidian] --json [--envelope]
       memvector relation add --vault <path> [--config-dir .obsidian] --json   (one JSON request on stdin)
       memvector graph neighbors --vault <path> --note <note.md> [--limit 100] [--config-dir .obsidian] --json
       memvector context --vault <path> --seed <note.md> [--seed <note.md> ...] [--config-dir .obsidian] --json
       memvector tools --json [--vault <path>]
       memvector --version

--instruction is put before the query as "Instruct: <text>\\nQuery: <query>", the query form instruction-tuned
embedding models such as qwen3-embedding expect; notes are embedded without it.
search reads MemVector's index and settings from <vault>/<config-dir>/plugins/${PLUGIN_ID}/ and never writes.
relation add takes "preview": true (Jovian 0.25.27+): the gate plans the note, writes nothing and answers with a
preview_id that \`jovian gate apply\` writes; --envelope answers in the agent envelope.
relation add builds the relation note for {"v":1,"from":"<note>.md","to":"<note>.md","relation":"REQUIRES","text":"..."}
and writes it through Jovian's gate (the plugin's "Jovian command" setting); an existing one is answered with its path.
Each hit carries an excerpt: the paragraph of the note sharing most words with the query. --folder and --type
(frontmatter type) filter before ranking. --envelope answers as {"v":1,"outcome":"ok","data":{...}} or
{"v":1,"outcome":"error","error":{"code","message"}} (knowOS ADR-0014); without it the output is unchanged.
graph neighbors lists the relations of one note from MemVector's graph (type, direction, the other note), always as
the envelope; reads only.
context assembles what the 2D view's synthesis would use for the seed notes: vector neighbors of their centroid and
graph neighbors up to the synthesis hop depth, with the caps of MemVector's settings (no flag overrides them), the
typed relations among seeds and hits, and the retrieval status of each channel; always as the envelope, reads only.
tools lists the commands offered to agents with their JSON schemas.
An API key for a cloud embedding endpoint comes from MEMVECTOR_EMBEDDING_API_KEY.
Exit codes: 0 ok, 1 error (JSON on stdout), 2 usage.`;

/** Node's fetch as the embedding POST: a body that is not JSON reads as undefined, like the plugin's requestUrl. */
const nodePost: EmbeddingPost = async (req) => {
  const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }
  return { status: res.status, json };
};

function parseArgs(argv: string[]): Map<string, string | true> | null {
  const args = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) return null;
    const [key, inline] = arg.slice(2).split(/=(.*)/s, 2);
    if (inline !== undefined) args.set(key, inline);
    else if (key === "json" || key === "envelope" || key === "version" || key === "help" || key === "dry-run") args.set(key, true);
    else if (i + 1 < argv.length) args.set(key, argv[++i]);
    else return null;
  }
  return args;
}

function usage(message: string): number {
  process.stderr.write(`[ERROR] ${message}\n${USAGE}\n`);
  return 2;
}

function fail(code: string, error: string, envelope = false): number {
  const body = envelope ? { v: 1, outcome: "error", error: { code, message: error } } : { outcome: "error", code, error };
  process.stdout.write(`${JSON.stringify(body)}\n`);
  return 1;
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === "__complete") {
    const candidates = await complete(rest);
    if (candidates.length > 0) {
      process.stdout.write(candidates.join("\n") + "\n");
    }
    return 0;
  }
  if (command === "completion") {
    if (rest.includes("--help") || rest.includes("-h")) {
      process.stdout.write("usage: memvector completion [zsh]\n");
      return 0;
    }
    if (rest.length === 0 || rest[0] === "zsh") {
      process.stdout.write(ZSH_SCRIPT);
      return 0;
    }
    return usage(`unsupported shell '${rest[0]}' (only zsh is supported)`);
  }
  if (command === "--version") {
    if (rest.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ v: 1, outcome: "ok", data: { memvector: MEMVECTOR_VERSION, commands: ["note search", "note read", "relation create", "tools"] } })}\n`);
      return 0;
    }
    process.stdout.write(`${JSON.stringify({ memvector: MEMVECTOR_VERSION, commands: ["search", "relation add", "graph neighbors", "context", "tools"] })}\n`);
    return 0;
  }
  if (command === undefined || command === "--help" || command === "-h") {
    process.stdout.write(`${USAGE}\n`);
    return command === undefined ? 2 : 0;
  }
  if (command === "note") return noteCommand(rest);
  if (command === "relation") return relationCommand(rest);
  if (command === "graph") return graphCommand(rest);
  if (command === "context") return contextCommand(rest);
  if (command === "tools") {
    // --vault (and --config-dir) are accepted and unused: an MCP server passes the vault to every component's list
    const toolArgs = parseArgs(rest);
    if (!toolArgs || [...toolArgs.keys()].some((k) => !["json", "vault", "config-dir"].includes(k))) {
      return usage("tools takes only --json (and --vault)");
    }
    process.stdout.write(`${JSON.stringify(toolList(MEMVECTOR_VERSION))}\n`);
    return 0;
  }
  if (command !== "search") return usage(`unknown command '${command}'`);
  const args = parseArgs(rest);
  if (!args) return usage("arguments must be --key value pairs");
  const known = new Set(["vault", "query", "limit", "instruction", "folder", "type", "config-dir", "json", "envelope"]);
  const unknown = [...args.keys()].filter((k) => !known.has(k));
  if (unknown.length > 0) return usage(`unknown option --${unknown[0]}`);
  const vault = args.get("vault");
  const query = args.get("query");
  if (typeof vault !== "string" || !vault) return usage("--vault is required");
  if (typeof query !== "string" || !query.trim()) return usage("--query is required");
  const limitRaw = args.get("limit") ?? "20";
  const limit = Number(limitRaw);
  if (typeof limitRaw !== "string" || !Number.isInteger(limit) || limit < 1) return usage("--limit must be a positive integer");
  const instruction = args.get("instruction");
  if (instruction !== undefined && (typeof instruction !== "string" || !instruction.trim())) return usage("--instruction needs a text");
  const folder = args.get("folder");
  if (folder !== undefined && (typeof folder !== "string" || !folder.trim())) return usage("--folder needs a folder");
  const type = args.get("type");
  if (type !== undefined && (typeof type !== "string" || !type.trim())) return usage("--type needs a type");
  const envelope = args.get("envelope") === true;
  const configDir = args.get("config-dir");
  const pluginDir = join(resolve(vault), typeof configDir === "string" ? configDir : ".obsidian", "plugins", PLUGIN_ID);

  const dbPath = join(pluginDir, DB_FILENAME);
  if (!existsSync(dbPath)) return fail("INDEX_MISSING", `No MemVector index at ${dbPath}; open the vault in Obsidian and let MemVector index it.`, envelope);
  let settings: Record<string, unknown> = {};
  const dataPath = join(pluginDir, "data.json");
  if (existsSync(dataPath)) {
    try {
      settings = JSON.parse(readFileSync(dataPath, "utf8")) as Record<string, unknown>;
    } catch (err) {
      return fail("SETTINGS_UNREADABLE", `${dataPath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`, envelope);
    }
  }
  const wasmPath = join(pluginDir, "sql-wasm.wasm");
  const result = await searchIndex(
    {
      settings: {
        embeddingModel: typeof settings.embeddingModel === "string" ? settings.embeddingModel : undefined,
        embeddingApiBaseUrl: typeof settings.embeddingApiBaseUrl === "string" ? settings.embeddingApiBaseUrl : undefined,
      },
      db: readFileSync(dbPath),
      wasm: existsSync(wasmPath) ? readFileSync(wasmPath) : getEmbeddedWasmBinary(),
    },
    query.trim(),
    limit,
    nodePost,
    process.env.MEMVECTOR_EMBEDDING_API_KEY ?? "",
    typeof instruction === "string" ? instruction.trim() : undefined,
    vaultReader(vault),
    { folder: typeof folder === "string" ? folder.trim() : undefined, type: typeof type === "string" ? type.trim() : undefined }
  );
  process.stdout.write(`${JSON.stringify(envelope ? searchEnvelope(result) : result)}\n`);
  return result.outcome === "ok" ? 0 : 1;
}

async function graphCommand(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  if (sub !== "neighbors") return usage(`unknown graph command '${sub ?? ""}'`);
  const args = parseArgs(rest);
  if (!args) return usage("arguments must be --key value pairs");
  const unknown = [...args.keys()].filter((k) => !["vault", "note", "limit", "config-dir", "json", "envelope"].includes(k));
  if (unknown.length > 0) return usage(`unknown option --${unknown[0]}`);
  const vault = args.get("vault");
  const note = args.get("note");
  if (typeof vault !== "string" || !vault) return usage("--vault is required");
  if (typeof note !== "string" || !note.trim()) return usage("--note is required");
  const limitRaw = args.get("limit") ?? "100";
  const limit = Number(limitRaw);
  if (typeof limitRaw !== "string" || !Number.isInteger(limit) || limit < 1) return usage("--limit must be a positive integer");
  const configDir = args.get("config-dir");
  const pluginDir = join(resolve(vault), typeof configDir === "string" ? configDir : ".obsidian", "plugins", PLUGIN_ID);
  const dbPath = join(pluginDir, DB_FILENAME);
  if (!existsSync(dbPath)) return fail("INDEX_MISSING", `No MemVector index at ${dbPath}; open the vault in Obsidian and let MemVector index it.`, true);
  const wasmPath = join(pluginDir, "sql-wasm.wasm");
  const result = await graphNeighbors(readFileSync(dbPath), existsSync(wasmPath) ? readFileSync(wasmPath) : getEmbeddedWasmBinary(), note.trim().replace(/^\.[/\\]+/, ""), limit);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.outcome === "ok" ? 0 : 1;
}

/** Splits every `--<key> <value>` / `--<key>=<value>` of a repeatable option off argv: (values, the rest). */
function takeRepeated(argv: string[], key: string): [string[], string[]] | null {
  const values: string[] = [];
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === `--${key}`) {
      if (i + 1 >= argv.length) return null;
      values.push(argv[++i]);
    } else if (argv[i].startsWith(`--${key}=`)) values.push(argv[i].slice(key.length + 3));
    else rest.push(argv[i]);
  }
  return [values, rest];
}

async function contextCommand(argv: string[]): Promise<number> {
  const split = takeRepeated(argv, "seed");
  if (!split) return usage("--seed needs a note");
  const [seeds, rest] = split;
  const args = parseArgs(rest);
  if (!args) return usage("arguments must be --key value pairs");
  const unknown = [...args.keys()].filter((k) => !["vault", "config-dir", "json", "envelope"].includes(k));
  if (unknown.length > 0) return usage(`unknown option --${unknown[0]}`);
  const vault = args.get("vault");
  if (typeof vault !== "string" || !vault) return usage("--vault is required");
  const cleaned = seeds.map((seed) => seed.trim().replace(/^\.[/\\]+/, ""));
  if (cleaned.length === 0 || cleaned.some((seed) => !seed)) return usage("at least one --seed <note.md> is required");
  const configDir = args.get("config-dir");
  const pluginDir = join(resolve(vault), typeof configDir === "string" ? configDir : ".obsidian", "plugins", PLUGIN_ID);
  const dbPath = join(pluginDir, DB_FILENAME);
  if (!existsSync(dbPath)) return fail("INDEX_MISSING", `No MemVector index at ${dbPath}; open the vault in Obsidian and let MemVector index it.`, true);
  let loaded: unknown = {};
  const dataPath = join(pluginDir, "data.json");
  if (existsSync(dataPath)) {
    try {
      loaded = JSON.parse(readFileSync(dataPath, "utf8"));
    } catch (err) {
      return fail("SETTINGS_UNREADABLE", `${dataPath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`, true);
    }
  }
  const wasmPath = join(pluginDir, "sql-wasm.wasm");
  // The plugin's own merge of data.json with its defaults, so a value the owner never changed is the plugin's
  const result = await contextFor(vault, migrateSettings(loaded), readFileSync(dbPath),
    existsSync(wasmPath) ? readFileSync(wasmPath) : getEmbeddedWasmBinary(), [...new Set(cleaned)]);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.outcome === "ok" ? 0 : 1;
}

/** Node's spawn for the gate, with the CLI's own environment under the extra bin folders runGate adds. */
const gateSpawn: GateSpawn = (command, args, options) =>
  nodeSpawn(command, args, { env: { ...process.env, ...options.env, PATH: [options.env.PATH, process.env.PATH].filter(Boolean).join(":") } });

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function parseCommandArgs(argv: string[]): { positionals: string[]; options: Map<string, string | true> } | null {
  const positionals: string[] = [];
  const options = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const [key, inline] = arg.slice(2).split(/=(.*)/s, 2);
      if (inline !== undefined) {
        options.set(key, inline);
      } else if (["json", "envelope", "version", "help", "neighbors", "context", "dry-run"].includes(key)) {
        options.set(key, true);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        options.set(key, argv[++i]);
      } else {
        return null;
      }
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, options };
}

async function noteCommand(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  if (sub === "--commands") {
    process.stdout.write(`${JSON.stringify({ commands: ["search", "read"] })}\n`);
    return 0;
  }
  if (sub === "--help" || sub === "-h") {
    process.stdout.write("usage: memvector note <search|read> [args...]\n");
    return 0;
  }
  if (sub === undefined) {
    return usage("note takes 'search' or 'read'");
  }
  if (sub === "search") return noteSearchCommand(rest);
  if (sub === "read") return noteReadCommand(rest);
  return usage(`unknown note command '${sub}'`);
}

async function noteSearchCommand(argv: string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write("usage: memvector note search <query> --vault <path> [--limit 20] [--instruction <text>] [--folder <folder>] [--type <type>] [--config-dir .obsidian] [--json]\n");
    return 0;
  }
  const parsed = parseCommandArgs(argv);
  if (!parsed) return usage("arguments must be --key value pairs");
  const { positionals, options } = parsed;
  const known = new Set(["vault", "query", "limit", "instruction", "folder", "type", "config-dir", "json"]);
  const unknown = [...options.keys()].filter((k) => !known.has(k));
  if (unknown.length > 0) return usage(`unknown option --${unknown[0]}`);

  const vault = options.get("vault");
  if (typeof vault !== "string" || !vault) return usage("--vault is required");

  const positionalQuery = positionals.join(" ").trim();
  const optionQuery = options.get("query");
  if (positionalQuery && optionQuery !== undefined) {
    return usage("cannot specify both a query positional argument and --query");
  }
  let query: string | undefined;
  if (positionalQuery) {
    query = positionalQuery;
  } else if (typeof optionQuery === "string") {
    query = optionQuery.trim();
  }
  if (!query) return usage("note search requires a query");

  const limitRaw = options.get("limit") ?? "20";
  const limit = Number(limitRaw);
  if (typeof limitRaw !== "string" || !Number.isInteger(limit) || limit < 1) return usage("--limit must be a positive integer");

  const instruction = options.get("instruction");
  if (instruction !== undefined && (typeof instruction !== "string" || !instruction.trim())) return usage("--instruction needs a text");

  const folder = options.get("folder");
  if (folder !== undefined && (typeof folder !== "string" || !folder.trim())) return usage("--folder needs a folder");

  const type = options.get("type");
  if (type !== undefined && (typeof type !== "string" || !type.trim())) return usage("--type needs a type");

  const isJson = options.get("json") === true;
  const configDir = options.get("config-dir");
  const pluginDir = join(resolve(vault), typeof configDir === "string" ? configDir : ".obsidian", "plugins", PLUGIN_ID);

  const dbPath = join(pluginDir, DB_FILENAME);
  if (!existsSync(dbPath)) {
    if (isJson) return fail("INDEX_MISSING", `No MemVector index at ${dbPath}; open the vault in Obsidian and let MemVector index it.`, true);
    process.stderr.write(`[ERROR] No MemVector index at ${dbPath}; open the vault in Obsidian and let MemVector index it.\n`);
    return 1;
  }

  let settings: Record<string, unknown> = {};
  const dataPath = join(pluginDir, "data.json");
  if (existsSync(dataPath)) {
    try {
      settings = JSON.parse(readFileSync(dataPath, "utf8")) as Record<string, unknown>;
    } catch (err) {
      const msg = `${dataPath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`;
      if (isJson) return fail("SETTINGS_UNREADABLE", msg, true);
      process.stderr.write(`[ERROR] ${msg}\n`);
      return 1;
    }
  }

  const wasmPath = join(pluginDir, "sql-wasm.wasm");
  const result = await searchIndex(
    {
      settings: {
        embeddingModel: typeof settings.embeddingModel === "string" ? settings.embeddingModel : undefined,
        embeddingApiBaseUrl: typeof settings.embeddingApiBaseUrl === "string" ? settings.embeddingApiBaseUrl : undefined,
      },
      db: readFileSync(dbPath),
      wasm: existsSync(wasmPath) ? readFileSync(wasmPath) : getEmbeddedWasmBinary(),
    },
    query,
    limit,
    nodePost,
    process.env.MEMVECTOR_EMBEDDING_API_KEY ?? "",
    typeof instruction === "string" ? instruction.trim() : undefined,
    vaultReader(vault),
    { folder: typeof folder === "string" ? folder.trim() : undefined, type: typeof type === "string" ? type.trim() : undefined }
  );

  if (isJson) {
    process.stdout.write(`${JSON.stringify(searchEnvelope(result))}\n`);
    return result.outcome === "ok" ? 0 : 1;
  }

  if (result.outcome === "ok") {
    if (result.results.length === 0) {
      process.stdout.write(`No hits for '${query}'.\n`);
    } else {
      const lines = result.results.map((r, i) => `${i + 1}. ${r.title} (${r.path}) [score: ${r.score.toFixed(3)}]\n   ${r.excerpt}`);
      process.stdout.write(`${lines.join("\n\n")}\n`);
    }
    return 0;
  } else {
    process.stderr.write(`[ERROR] ${result.error}\n`);
    return 1;
  }
}

async function noteReadCommand(argv: string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write("usage: memvector note read <note.md> --neighbors --vault <path> [--limit 100] [--config-dir .obsidian] [--json]\n       memvector note read <seed1.md> [<seed2.md> ...] --context --vault <path> [--config-dir .obsidian] [--json]\n");
    return 0;
  }
  const splitSeeds = takeRepeated(argv, "seed");
  if (splitSeeds === null) {
    if (argv.includes("--neighbors")) return usage("unknown option --seed");
    if (argv.includes("--context")) return usage("--seed needs a note");
    return usage("note read requires --neighbors or --context");
  }
  const extraSeeds = splitSeeds[0];
  const argvWithoutSeeds = splitSeeds[1];
  const parsed = parseCommandArgs(argvWithoutSeeds);
  if (!parsed) return usage("arguments must be --key value pairs");
  const { positionals, options } = parsed;

  const hasNeighbors = options.get("neighbors") === true;
  const hasContext = options.get("context") === true;
  if (!hasNeighbors && !hasContext) {
    return usage("note read requires --neighbors or --context");
  }
  if (hasNeighbors && hasContext) {
    return usage("note read cannot take both --neighbors and --context");
  }

  if (hasNeighbors) {
    if (extraSeeds.length > 0) {
      return usage("unknown option --seed");
    }
    const known = new Set(["vault", "note", "limit", "config-dir", "json", "neighbors"]);
    const unknown = [...options.keys()].filter((k) => !known.has(k));
    if (unknown.length > 0) return usage(`unknown option --${unknown[0]}`);

    const vault = options.get("vault");
    if (typeof vault !== "string" || !vault) return usage("--vault is required");

    if (positionals.length > 1) {
      return usage("note read --neighbors takes at most one note");
    }
    let note: string | undefined;
    if (positionals.length === 1) {
      if (options.has("note")) {
        return usage("cannot specify both a note positional argument and --note");
      }
      note = positionals[0];
    } else if (options.has("note")) {
      const n = options.get("note");
      if (typeof n === "string") note = n;
    }
    if (typeof note !== "string" || !note.trim()) return usage("--note is required");

    const limitRaw = options.get("limit") ?? "100";
    const limit = Number(limitRaw);
    if (typeof limitRaw !== "string" || !Number.isInteger(limit) || limit < 1) return usage("--limit must be a positive integer");

    const isJson = options.get("json") === true;
    const configDir = options.get("config-dir");
    const pluginDir = join(resolve(vault), typeof configDir === "string" ? configDir : ".obsidian", "plugins", PLUGIN_ID);
    const dbPath = join(pluginDir, DB_FILENAME);
    if (!existsSync(dbPath)) {
      if (isJson) return fail("INDEX_MISSING", `No MemVector index at ${dbPath}; open the vault in Obsidian and let MemVector index it.`, true);
      process.stderr.write(`[ERROR] No MemVector index at ${dbPath}; open the vault in Obsidian and let MemVector index it.\n`);
      return 1;
    }

    const wasmPath = join(pluginDir, "sql-wasm.wasm");
    const result = await graphNeighbors(
      readFileSync(dbPath),
      existsSync(wasmPath) ? readFileSync(wasmPath) : getEmbeddedWasmBinary(),
      note.trim().replace(/^\.[/\\]+/, ""),
      limit
    );

    if (isJson) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return result.outcome === "ok" ? 0 : 1;
    }

    if (result.outcome === "ok") {
      if (result.data.neighbors.length === 0) {
        process.stdout.write(`${result.data.title} (${result.data.note}) has no neighbors.\n`);
      } else {
        const lines = [`Neighbors of ${result.data.title} (${result.data.note}):`];
        for (const n of result.data.neighbors) {
          const dir = n.direction === "out" ? "->" : "<-";
          lines.push(`  ${dir} [${n.type}] ${n.title} (${n.path})${n.description ? `: ${n.description}` : ""}`);
        }
        process.stdout.write(`${lines.join("\n")}\n`);
      }
      return 0;
    } else {
      process.stderr.write(`[ERROR] ${result.error.message}\n`);
      return 1;
    }
  } else {
    // context
    const known = new Set(["vault", "config-dir", "json", "context"]);
    const unknown = [...options.keys()].filter((k) => !known.has(k));
    if (unknown.length > 0) return usage(`unknown option --${unknown[0]}`);

    const vault = options.get("vault");
    if (typeof vault !== "string" || !vault) return usage("--vault is required");

    const seeds = [...positionals, ...extraSeeds].map((s) => s.trim().replace(/^\.[/\\]+/, "")).filter(Boolean);
    if (seeds.length === 0) return usage("at least one seed note is required");

    const isJson = options.get("json") === true;
    const configDir = options.get("config-dir");
    const pluginDir = join(resolve(vault), typeof configDir === "string" ? configDir : ".obsidian", "plugins", PLUGIN_ID);
    const dbPath = join(pluginDir, DB_FILENAME);
    if (!existsSync(dbPath)) {
      if (isJson) return fail("INDEX_MISSING", `No MemVector index at ${dbPath}; open the vault in Obsidian and let MemVector index it.`, true);
      process.stderr.write(`[ERROR] No MemVector index at ${dbPath}; open the vault in Obsidian and let MemVector index it.\n`);
      return 1;
    }

    let loaded: unknown = {};
    const dataPath = join(pluginDir, "data.json");
    if (existsSync(dataPath)) {
      try {
        loaded = JSON.parse(readFileSync(dataPath, "utf8"));
      } catch (err) {
        const msg = `${dataPath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`;
        if (isJson) return fail("SETTINGS_UNREADABLE", msg, true);
        process.stderr.write(`[ERROR] ${msg}\n`);
        return 1;
      }
    }

    const wasmPath = join(pluginDir, "sql-wasm.wasm");
    const result = await contextFor(
      vault,
      migrateSettings(loaded),
      readFileSync(dbPath),
      existsSync(wasmPath) ? readFileSync(wasmPath) : getEmbeddedWasmBinary(),
      [...new Set(seeds)]
    );

    if (isJson) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return result.outcome === "ok" ? 0 : 1;
    }

    if (result.outcome === "ok") {
      const lines = [
        `Context for seeds: ${result.data.seeds.map((s) => `${s.title} (${s.path})`).join(", ")}`,
        `Hits (${result.data.hits.length}):`,
        ...result.data.hits.map((h) => `  - ${h.title} (${h.path}) [${h.origin}${h.similarity !== null ? `, sim: ${h.similarity.toFixed(3)}` : ""}${h.hops !== null ? `, hops: ${h.hops}` : ""}]`),
      ];
      if (result.data.relations.length > 0) {
        lines.push(`Relations (${result.data.relations.length}):`);
        for (const r of result.data.relations) {
          lines.push(`  - ${r.from} --[${r.type}]--> ${r.to}${r.description ? ` (${r.description})` : ""}`);
        }
      }
      process.stdout.write(`${lines.join("\n")}\n`);
      return 0;
    } else {
      process.stderr.write(`[ERROR] ${result.error.message}\n`);
      return 1;
    }
  }
}

async function relationCommand(argv: string[]): Promise<number> {
  // The gate runner uses window timers (Obsidian popout rule); Node has them on globalThis
  (globalThis as { window?: unknown }).window ??= globalThis;
  const [sub, ...rest] = argv;
  if (sub === "--commands") {
    process.stdout.write(`${JSON.stringify({ commands: ["create", "add"] })}\n`);
    return 0;
  }
  if (sub === "--help" || sub === "-h") {
    process.stdout.write("usage: memvector relation <create|add> [args...]\n");
    return 0;
  }
  if (sub === undefined) {
    return usage("relation takes 'create' or 'add'");
  }
  if (sub !== "add" && sub !== "create") return usage(`unknown relation command '${sub}'`);
  const isCreate = sub === "create";
  const args = parseArgs(rest);
  if (!args) return usage("arguments must be --key value pairs");
  const known = isCreate
    ? ["vault", "config-dir", "json", "dry-run"]
    : ["vault", "config-dir", "json", "envelope"];
  const unknown = [...args.keys()].filter((k) => !known.includes(k));
  if (unknown.length > 0) return usage(`unknown option --${unknown[0]}`);
  const vault = args.get("vault");
  if (typeof vault !== "string" || !vault) return usage("--vault is required");
  const isJson = args.get("json") === true;
  const configDir = args.get("config-dir");
  const dataPath = join(resolve(vault), typeof configDir === "string" ? configDir : ".obsidian", "plugins", PLUGIN_ID, "data.json");
  let settings: Record<string, unknown> = {};
  if (existsSync(dataPath)) {
    try {
      settings = JSON.parse(readFileSync(dataPath, "utf8")) as Record<string, unknown>;
    } catch (err) {
      const msg = `${dataPath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`;
      if (isCreate) {
        if (isJson) {
          process.stdout.write(`${JSON.stringify({ v: 1, outcome: "error", error: { code: "SETTINGS_UNREADABLE", message: msg } })}\n`);
        } else {
          process.stderr.write(`[ERROR] ${msg}\n`);
        }
        return 1;
      }
      return fail("SETTINGS_UNREADABLE", msg, false);
    }
  }
  let request: unknown;
  try {
    request = JSON.parse(await readStdin());
  } catch {
    const msg = "stdin is not one JSON request.";
    if (isCreate) {
      if (isJson) {
        process.stdout.write(`${JSON.stringify({ v: 1, outcome: "error", error: { code: "INVALID_REQUEST", message: msg } })}\n`);
      } else {
        process.stderr.write(`[ERROR] ${msg}\n`);
      }
      return 1;
    }
    return fail("INVALID_REQUEST", msg, false);
  }
  if (isCreate) {
    if (args.get("dry-run") === true) {
      if (request && typeof request === "object" && (request as Record<string, unknown>).preview === false) {
        return usage("cannot specify --dry-run with 'preview': false in request");
      }
      if (request && typeof request === "object") {
        (request as Record<string, unknown>).preview = true;
      }
    }
  }
  const result = await relationAdd(vault, request, settings, { spawn: gateSpawn, clientVersion: MEMVECTOR_VERSION });

  if (isCreate) {
    const { outcome, code, error, ...data } = result;
    const isTimeout = outcome === "timeout" ||
      (code ?? "").toUpperCase().includes("TIMEOUT") ||
      (code ?? "").toUpperCase().includes("LOCK") ||
      (error ?? "").toLowerCase().includes("timeout") ||
      (error ?? "").toLowerCase().includes("timed out") ||
      (error ?? "").toLowerCase().includes("lock");
    const exitCode = outcome === "ok" ? 0 : (isTimeout ? 3 : 1);
    if (isJson) {
      const body = outcome === "ok"
        ? { v: 1, outcome, data }
        : { v: 1, outcome: isTimeout ? "timeout" : "error", error: { code: code ?? (isTimeout ? "LOCK_TIMEOUT" : "FAILED"), message: error ?? "" } };
      process.stdout.write(`${JSON.stringify(body)}\n`);
      return exitCode;
    }
    if (outcome === "ok") {
      if (data.preview) {
        process.stdout.write(`Relation preview created for ${data.path} (id: ${(data.preview as { preview_id?: string })?.preview_id ?? ""})\n`);
      } else if (data.created) {
        process.stdout.write(`Relation created: ${data.path}\n`);
      } else {
        process.stdout.write(`Relation already exists: ${data.path}\n`);
      }
      return 0;
    } else {
      process.stderr.write(`[ERROR] ${error ?? "Failed to create relation"}\n`);
      return exitCode;
    }
  }

  if (args.get("envelope") === true) {
    const { outcome, code, error, ...data } = result;
    const body = outcome === "ok" ? { v: 1, outcome, data } : { v: 1, outcome, error: { code: code ?? "FAILED", message: error ?? "" } };
    process.stdout.write(`${JSON.stringify(body)}\n`);
    return outcome === "ok" ? 0 : 1;
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.outcome === "ok" ? 0 : 1;
}

// exitCode instead of process.exit(): the process ends after stdout is written, also when it is piped
void main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code; },
  (err: unknown) => { process.exitCode = fail("INTERNAL", err instanceof Error ? err.message : String(err)); }
);
