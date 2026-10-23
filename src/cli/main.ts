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
import { toolList } from "./tools";

declare const MEMVECTOR_VERSION: string;

const USAGE = `usage: memvector search --vault <path> --query <text> [--limit 20] [--instruction <text>] [--folder <folder>] [--type <type>] [--config-dir .obsidian] --json [--envelope]
       memvector relation add --vault <path> [--config-dir .obsidian] --json   (one JSON request on stdin)
       memvector graph neighbors --vault <path> --note <note.md> [--limit 100] [--config-dir .obsidian] --json
       memvector tools --json
       memvector --version

--instruction is put before the query as "Instruct: <text>\\nQuery: <query>", the query form instruction-tuned
embedding models such as qwen3-embedding expect; notes are embedded without it.
search reads MemVector's index and settings from <vault>/<config-dir>/plugins/${PLUGIN_ID}/ and never writes.
relation add builds the relation note for {"v":1,"from":"<note>.md","to":"<note>.md","relation":"REQUIRES","text":"..."}
and writes it through Jovian's gate (the plugin's "Jovian command" setting); an existing one is answered with its path.
Each hit carries an excerpt: the paragraph of the note sharing most words with the query. --folder and --type
(frontmatter type) filter before ranking. --envelope answers as {"v":1,"outcome":"ok","data":{...}} or
{"v":1,"outcome":"error","error":{"code","message"}} (knowOS ADR-0014); without it the output is unchanged.
graph neighbors lists the relations of one note from MemVector's graph (type, direction, the other note), always as
the envelope; reads only.
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
    else if (key === "json" || key === "envelope" || key === "version" || key === "help") args.set(key, true);
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
  if (command === "--version") {
    process.stdout.write(`${JSON.stringify({ memvector: MEMVECTOR_VERSION, commands: ["search", "relation add", "graph neighbors", "tools"] })}\n`);
    return 0;
  }
  if (command === undefined || command === "--help" || command === "-h") {
    process.stdout.write(`${USAGE}\n`);
    return command === undefined ? 2 : 0;
  }
  if (command === "relation") return relationCommand(rest);
  if (command === "graph") return graphCommand(rest);
  if (command === "tools") {
    if (rest.some((a) => a !== "--json")) return usage("tools takes only --json");
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
  const result = await graphNeighbors(readFileSync(dbPath), existsSync(wasmPath) ? readFileSync(wasmPath) : getEmbeddedWasmBinary(), note.trim(), limit);
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

async function relationCommand(argv: string[]): Promise<number> {
  // The gate runner uses window timers (Obsidian popout rule); Node has them on globalThis
  (globalThis as { window?: unknown }).window ??= globalThis;
  const [sub, ...rest] = argv;
  if (sub !== "add") return usage(`unknown relation command '${sub ?? ""}'`);
  const args = parseArgs(rest);
  if (!args) return usage("arguments must be --key value pairs");
  const unknown = [...args.keys()].filter((k) => !["vault", "config-dir", "json"].includes(k));
  if (unknown.length > 0) return usage(`unknown option --${unknown[0]}`);
  const vault = args.get("vault");
  if (typeof vault !== "string" || !vault) return usage("--vault is required");
  const configDir = args.get("config-dir");
  const dataPath = join(resolve(vault), typeof configDir === "string" ? configDir : ".obsidian", "plugins", PLUGIN_ID, "data.json");
  let settings: Record<string, unknown> = {};
  if (existsSync(dataPath)) {
    try {
      settings = JSON.parse(readFileSync(dataPath, "utf8")) as Record<string, unknown>;
    } catch (err) {
      return fail("SETTINGS_UNREADABLE", `${dataPath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  let request: unknown;
  try {
    request = JSON.parse(await readStdin());
  } catch {
    return fail("INVALID_REQUEST", "stdin is not one JSON request.");
  }
  const result = await relationAdd(vault, request, settings, { spawn: gateSpawn, clientVersion: MEMVECTOR_VERSION });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.outcome === "ok" ? 0 : 1;
}

// exitCode instead of process.exit(): the process ends after stdout is written, also when it is piped
void main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code; },
  (err: unknown) => { process.exitCode = fail("INTERNAL", err instanceof Error ? err.message : String(err)); }
);
