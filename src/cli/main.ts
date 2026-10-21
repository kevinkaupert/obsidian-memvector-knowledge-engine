import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getEmbeddedWasmBinary } from "../sync/sqlite/embeddedWasm";
import type { EmbeddingPost } from "../llm/embeddingRequest";
import { DB_FILENAME, PLUGIN_ID, searchIndex } from "./search";

declare const MEMVECTOR_VERSION: string;

const USAGE = `usage: memvector search --vault <path> --query <text> [--limit 20] [--config-dir .obsidian] --json
       memvector --version

Reads MemVector's index and settings from <vault>/<config-dir>/plugins/${PLUGIN_ID}/ and never writes.
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
    else if (key === "json" || key === "version" || key === "help") args.set(key, true);
    else if (i + 1 < argv.length) args.set(key, argv[++i]);
    else return null;
  }
  return args;
}

function usage(message: string): number {
  process.stderr.write(`[ERROR] ${message}\n${USAGE}\n`);
  return 2;
}

function fail(code: string, error: string): number {
  process.stdout.write(`${JSON.stringify({ outcome: "error", code, error })}\n`);
  return 1;
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === "--version") {
    process.stdout.write(`${JSON.stringify({ memvector: MEMVECTOR_VERSION, commands: ["search"] })}\n`);
    return 0;
  }
  if (command === undefined || command === "--help" || command === "-h") {
    process.stdout.write(`${USAGE}\n`);
    return command === undefined ? 2 : 0;
  }
  if (command !== "search") return usage(`unknown command '${command}'`);
  const args = parseArgs(rest);
  if (!args) return usage("arguments must be --key value pairs");
  const known = new Set(["vault", "query", "limit", "config-dir", "json"]);
  const unknown = [...args.keys()].filter((k) => !known.has(k));
  if (unknown.length > 0) return usage(`unknown option --${unknown[0]}`);
  const vault = args.get("vault");
  const query = args.get("query");
  if (typeof vault !== "string" || !vault) return usage("--vault is required");
  if (typeof query !== "string" || !query.trim()) return usage("--query is required");
  const limitRaw = args.get("limit") ?? "20";
  const limit = Number(limitRaw);
  if (typeof limitRaw !== "string" || !Number.isInteger(limit) || limit < 1) return usage("--limit must be a positive integer");
  const configDir = args.get("config-dir");
  const pluginDir = join(resolve(vault), typeof configDir === "string" ? configDir : ".obsidian", "plugins", PLUGIN_ID);

  const dbPath = join(pluginDir, DB_FILENAME);
  if (!existsSync(dbPath)) return fail("INDEX_MISSING", `No MemVector index at ${dbPath}; open the vault in Obsidian and let MemVector index it.`);
  let settings: Record<string, unknown> = {};
  const dataPath = join(pluginDir, "data.json");
  if (existsSync(dataPath)) {
    try {
      settings = JSON.parse(readFileSync(dataPath, "utf8")) as Record<string, unknown>;
    } catch (err) {
      return fail("SETTINGS_UNREADABLE", `${dataPath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
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
    process.env.MEMVECTOR_EMBEDDING_API_KEY ?? ""
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.outcome === "ok" ? 0 : 1;
}

void main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => process.exit(fail("INTERNAL", err instanceof Error ? err.message : String(err)))
);
