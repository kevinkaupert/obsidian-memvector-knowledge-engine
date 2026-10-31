/**
 * Shell completion engine for MemVector CLI (knowOS ADR-0017 §10 and Plan 0023 Phase 2b).
 *
 * Architecture & Invariants:
 * - Read-only execution: never writes to the vault, dotfiles, or shell configurations.
 * - Fast execution (<200ms) with 0 model calls.
 * - Proper shell escaping for paths containing spaces, colons, and quotes.
 * - Graceful degradation: returns empty candidates rather than raising errors or exiting non-zero.
 * - Old legacy command names receive no completion.
 * - Formatted for zsh `_describe` (`candidate:description` or `candidate`).
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import initSqlJs from "sql.js";
import { getEmbeddedWasmBinary } from "../sync/sqlite/embeddedWasm";
import { DB_FILENAME, PLUGIN_ID } from "./search";

export const ZSH_SCRIPT = `#compdef memvector

_memvector() {
    local -a dirs
    local -a files
    local -a others
    local -a tilde_dirs
    local -a normal_dirs
    local -a tilde_files
    local -a normal_files
    local output
    local line
    local temp
    local d
    local f
    local prefix
    output="$(memvector __complete "\${(@Q)words[2,CURRENT]}" 2>/dev/null)"
    if [[ -n "$output" ]]; then
        while IFS= read -r line; do
            [[ -z "$line" ]] && continue
            temp="\${line//\\\\:}"
            if [[ "$line" == */ && "$temp" != *:* ]]; then
                dirs+=("\${(Q)line}")
            elif [[ "$temp" != *:* ]]; then
                files+=("\${(Q)line}")
            else
                others+=("$line")
            fi
        done <<< "$output"
        if [[ \${#dirs[@]} -gt 0 ]]; then
            for d in "\${dirs[@]}"; do
                if [[ "$d" == "~/"* ]]; then
                    tilde_dirs+=("\${d#"~/"}")
                elif [[ "$d" == --*="~/"* ]]; then
                    prefix="\${d%%"~/"*}~/"
                    compadd -P "$prefix" -S '' -- "\${d#"$prefix"}"
                else
                    normal_dirs+=("$d")
                fi
            done
            if [[ \${#tilde_dirs[@]} -gt 0 ]]; then
                compadd -P "~/" -S '' -- "\${tilde_dirs[@]}"
            fi
            if [[ \${#normal_dirs[@]} -gt 0 ]]; then
                compadd -S '' -- "\${normal_dirs[@]}"
            fi
        fi
        if [[ \${#files[@]} -gt 0 ]]; then
            for f in "\${files[@]}"; do
                if [[ "$f" == "~/"* ]]; then
                    tilde_files+=("\${f#"~/"}")
                elif [[ "$f" == --*="~/"* ]]; then
                    prefix="\${d%%"~/"*}~/"
                    compadd -U -P "$prefix" -- "\${f#"$prefix"}"
                else
                    normal_files+=("$f")
                fi
            done
            if [[ \${#tilde_files[@]} -gt 0 ]]; then
                compadd -U -P "~/" -- "\${tilde_files[@]}"
            fi
            if [[ \${#normal_files[@]} -gt 0 ]]; then
                compadd -U -- "\${normal_files[@]}"
            fi
        fi
        if [[ \${#others[@]} -gt 0 ]]; then
            _describe -t commands 'memvector commands' others
        fi
    fi
}

if [[ -n "$ZSH_VERSION" ]]; then
    compdef _memvector memvector 2>/dev/null || true
fi
`;

export interface CommandInfo {
  verbs: Record<string, string>;
  default_verb?: string;
}

export const COMMAND_TABLE: Record<string, CommandInfo> = {
  note: {
    verbs: {
      search: "search notes by vector similarity",
      read: "read graph neighbors or synthesis context of notes",
    },
  },
  relation: {
    verbs: {
      create: "create or preview typed relation note through gate",
    },
  },
  tools: {
    verbs: {},
  },
};

export const ROOT_OPTIONS: Array<[string, string]> = [
  ["--help", "show help message"],
  ["-h", "show help message"],
  ["--version", "show version information"],
];

export const GLOBAL_OPTIONS = ROOT_OPTIONS;

export const VERB_OPTIONS: Record<string, Array<[string, string]>> = {
  "note:search": [
    ["--vault", "path to Obsidian vault directory"],
    ["--config-dir", "Obsidian configuration directory (.obsidian)"],
    ["--query", "search text query"],
    ["--limit", "maximum hits to return (default 20)"],
    ["--instruction", "instruction prefixed to query for embedding"],
    ["--folder", "filter notes by vault folder prefix"],
    ["--type", "filter notes by frontmatter type"],
    ["--json", "output structured JSON envelope"],
  ],
  "note:read": [
    ["--vault", "path to Obsidian vault directory"],
    ["--config-dir", "Obsidian configuration directory (.obsidian)"],
    ["--neighbors", "query graph neighbors for a note"],
    ["--context", "assemble 2D view synthesis context for seed notes"],
    ["--note", "target note for graph neighbors"],
    ["--seed", "seed note for synthesis context (repeatable)"],
    ["--limit", "maximum neighbors to return (default 100)"],
    ["--json", "output structured JSON envelope"],
  ],
  "relation:create": [
    ["--vault", "path to Obsidian vault directory"],
    ["--config-dir", "Obsidian configuration directory (.obsidian)"],
    ["--dry-run", "plan relation note without writing"],
    ["--json", "output structured JSON envelope"],
  ],
  "tools:": [
    ["--vault", "path to Obsidian vault directory"],
    ["--config-dir", "Obsidian configuration directory (.obsidian)"],
    ["--json", "output JSON schema of agent tools"],
  ],
};

export const VALUE_OPTIONS = new Set([
  "--vault",
  "--config-dir",
  "--query",
  "--limit",
  "--instruction",
  "--folder",
  "--type",
  "--note",
  "--seed",
]);

export function unquoteToken(t: string): string {
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1);
  }
  if (t.startsWith('"') || t.startsWith("'")) {
    return t.slice(1);
  }
  return t;
}

export function normalizeSearchPrefix(prefix: string): string {
  let clean = unquoteToken(prefix);
  clean = clean.replace(/\\\\/g, "\\");
  clean = clean.replace(/\\:/g, ":");
  clean = clean.replace(/\\ /g, " ");
  clean = clean.replace(/\\'/g, "'");
  clean = clean.replace(/\\"/g, '"');
  return clean;
}

export function escapeLikePattern(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function escapeCandidate(text: string): string {
  let escaped = text.replace(/\\/g, "\\\\");
  escaped = escaped.replace(/:/g, "\\:");
  escaped = escaped.replace(/ /g, "\\ ");
  escaped = escaped.replace(/'/g, "\\'");
  escaped = escaped.replace(/"/g, '\\"');
  return escaped;
}

export function getFsPaths(prefix = "", onlyDirs = false): string[] {
  const clean = normalizeSearchPrefix(prefix);
  const isHome = clean === "~" || clean.startsWith("~/") || clean.startsWith("~\\");
  const home = homedir();

  let lexicalDir = "";
  let filePrefix = "";
  let searchDir = ".";

  if (clean.includes("/") || clean.includes("\\")) {
    const lastSlash = Math.max(clean.lastIndexOf("/"), clean.lastIndexOf("\\"));
    lexicalDir = clean.slice(0, lastSlash + 1);
    filePrefix = clean.slice(lastSlash + 1);
    if (isHome) {
      const sub = lastSlash > 1 ? clean.slice(2, lastSlash) : "";
      searchDir = sub ? join(home, sub) : home;
    } else {
      const dirPart = clean.slice(0, lastSlash);
      searchDir = dirPart || "/";
    }
  } else {
    if (isHome) {
      lexicalDir = "~/";
      filePrefix = "";
      searchDir = home;
    } else {
      lexicalDir = "";
      filePrefix = clean;
      searchDir = ".";
    }
  }

  const results: string[] = [];
  try {
    if (existsSync(searchDir) && statSync(searchDir).isDirectory()) {
      const items = readdirSync(searchDir).sort();
      for (const item of items) {
        if (!filePrefix || item.startsWith(filePrefix)) {
          const itemPath = join(searchDir, item);
          let isDir = false;
          try {
            isDir = statSync(itemPath).isDirectory();
          } catch {
            continue;
          }
          if (onlyDirs && !isDir) continue;
          let candidate = `${lexicalDir}${item}`;
          if (isDir) candidate += "/";
          results.push(escapeCandidate(candidate));
          if (results.length >= 50) break;
        }
      }
    }
  } catch {
    // failure-tolerant
  }
  return results.sort();
}

export function expandTilde(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return join(homedir(), p.slice(2));
  }
  return p;
}

export function findVaultPath(tokens: string[]): { vault: string | null; configDir: string } {
  let vault: string | null = null;
  let configDir = ".obsidian";

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === "--vault" && i + 1 < tokens.length) {
      vault = tokens[i + 1];
    } else if (tok.startsWith("--vault=")) {
      vault = tok.slice("--vault=".length);
    } else if (tok === "--config-dir" && i + 1 < tokens.length) {
      configDir = tokens[i + 1];
    } else if (tok.startsWith("--config-dir=")) {
      configDir = tok.slice("--config-dir=".length);
    }
  }

  if (vault) {
    vault = expandTilde(vault);
  } else {
    // Check environment or parent directories for .obsidian
    if (process.env.MEMVECTOR_VAULT && existsSync(process.env.MEMVECTOR_VAULT)) {
      vault = expandTilde(process.env.MEMVECTOR_VAULT);
    } else {
      let curr = resolve(".");
      while (true) {
        if (existsSync(join(curr, configDir))) {
          vault = curr;
          break;
        }
        const parent = dirname(curr);
        if (parent === curr) break;
        curr = parent;
      }
    }
  }

  return { vault, configDir };
}

export async function getNoteTargets(
  vaultPath: string | null,
  configDir = ".obsidian",
  prefix = ""
): Promise<string[]> {
  if (!vaultPath) return [];

  const cleanPrefix = normalizeSearchPrefix(prefix);
  let lexicalLead = "";
  let searchPrefix = cleanPrefix;
  if (cleanPrefix.startsWith("./") || cleanPrefix.startsWith(".\\")) {
    lexicalLead = cleanPrefix.slice(0, 2);
    searchPrefix = cleanPrefix.slice(2);
  }

  const results = new Set<string>();
  const startTime = Date.now();

  // 1. Try reading from SQLite index if available
  const pluginDir = join(resolve(vaultPath), configDir, "plugins", PLUGIN_ID);
  const dbPath = join(pluginDir, DB_FILENAME);

  if (existsSync(dbPath)) {
    try {
      const wasmPath = join(pluginDir, "sql-wasm.wasm");
      const wasm = existsSync(wasmPath) ? readFileSync(wasmPath) : getEmbeddedWasmBinary();
      const SQL = await initSqlJs({
        wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer,
      });
      const db = new SQL.Database(readFileSync(dbPath));
      try {
        let rows;
        if (!searchPrefix) {
          rows = db.exec("SELECT path FROM notes ORDER BY path ASC LIMIT 500");
        } else {
          const escaped = escapeLikePattern(searchPrefix);
          rows = db.exec(
            "SELECT path FROM notes WHERE path LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' ORDER BY path ASC LIMIT 500",
            [`%${escaped}%`, `${escaped}%`, `${escaped}%`]
          );
        }
        if (rows.length > 0 && rows[0].values) {
          for (const row of rows[0].values) {
            const pathStr = String(row[0] ?? "");
            results.add(`${lexicalLead}${pathStr}`);
            if (Date.now() - startTime > 150 || results.size >= 500) break;
          }
        }
      } finally {
        db.close();
      }
    } catch {
      // Fallback to filesystem scan below
    }
  }

  // 2. If SQLite index was missing or empty, fallback to vault scan for markdown files
  if (results.size === 0 && existsSync(vaultPath)) {
    try {
      const queue: string[] = [""];
      while (queue.length > 0) {
        if (Date.now() - startTime > 150 || results.size >= 500) break;
        const relDir = queue.shift()!;
        const absDir = relDir ? join(vaultPath, relDir) : vaultPath;
        let entries: string[] = [];
        try {
          entries = readdirSync(absDir).sort();
        } catch {
          continue;
        }

        for (const entry of entries) {
          if (entry.startsWith(".")) continue;
          const entryRel = relDir ? `${relDir}/${entry}` : entry;
          const entryAbs = join(vaultPath, entryRel);
          let stat;
          try {
            stat = statSync(entryAbs);
          } catch {
            continue;
          }
          if (stat.isDirectory()) {
            queue.push(entryRel);
          } else if (stat.isFile() && entry.endsWith(".md")) {
            if (
              !searchPrefix ||
              entryRel.startsWith(searchPrefix) ||
              entry.startsWith(searchPrefix) ||
              entryRel.includes(searchPrefix)
            ) {
              results.add(`${lexicalLead}${entryRel}`);
              if (results.size >= 500) break;
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return [...results].sort().map(escapeCandidate);
}

export function getVaultFolders(vaultPath: string | null, prefix = ""): string[] {
  if (!vaultPath || !existsSync(vaultPath)) return [];
  const cleanPrefix = normalizeSearchPrefix(prefix);
  const results = new Set<string>();

  try {
    const queue: string[] = [""];
    while (queue.length > 0 && results.size < 100) {
      const relDir = queue.shift()!;
      const absDir = relDir ? join(vaultPath, relDir) : vaultPath;
      let entries: string[] = [];
      try {
        entries = readdirSync(absDir).sort();
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.startsWith(".")) continue;
        const entryRel = relDir ? `${relDir}/${entry}` : entry;
        const entryAbs = join(vaultPath, entryRel);
        try {
          if (statSync(entryAbs).isDirectory()) {
            if (!cleanPrefix || entryRel.startsWith(cleanPrefix)) {
              results.add(entryRel);
            }
            queue.push(entryRel);
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }

  return [...results].sort().map(escapeCandidate);
}

export function getConfigDirCandidates(vaultPath: string | null, prefix = ""): string[] {
  const cleanPrefix = normalizeSearchPrefix(prefix);
  const defaultList = !cleanPrefix || ".obsidian".startsWith(cleanPrefix) ? [".obsidian"] : [];
  if (vaultPath && existsSync(vaultPath)) {
    const candidates = new Set<string>(defaultList);
    try {
      const entries = readdirSync(vaultPath).sort();
      for (const entry of entries) {
        if (!cleanPrefix || entry.startsWith(cleanPrefix)) {
          const entryPath = join(vaultPath, entry);
          try {
            if (statSync(entryPath).isDirectory()) {
              candidates.add(entry);
            }
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }
    return [...candidates].sort().map(escapeCandidate);
  }
  // When no vault is detected, getFsPaths already returns escaped candidates
  const fsCandidates = getFsPaths(prefix, true);
  return [...new Set([...defaultList.map(escapeCandidate), ...fsCandidates])].sort();
}

export async function completeOptionValue(
  opt: string,
  val: string,
  vault: string | null,
  configDir = ".obsidian"
): Promise<string[]> {
  if (opt === "--vault") {
    return getFsPaths(val, true);
  }
  if (opt === "--config-dir") {
    return getConfigDirCandidates(vault, val);
  }
  if (opt === "--folder") {
    return getVaultFolders(vault, val);
  }
  if (opt === "--note" || opt === "--seed") {
    return getNoteTargets(vault, configDir, val);
  }
  return [];
}

export async function complete(argv: string[]): Promise<string[]> {
  const tokens = argv.map(unquoteToken);
  const { vault, configDir } = findVaultPath(tokens);

  if (tokens.length === 0 || (tokens.length === 1 && tokens[0] === "")) {
    const nouns = Object.entries(COMMAND_TABLE).map(([k, info]) => {
      const desc = Object.keys(info.verbs).length > 0 ? `commands for ${k}s` : `${k} command`;
      return `${k}:${desc}`;
    });
    const roots = ROOT_OPTIONS.map(([o, d]) => `${o}:${d}`);
    return [...nouns, ...roots];
  }

  const first = tokens[0];

  // If user is typing the first command/noun
  if (tokens.length === 1) {
    if (first.startsWith("-")) {
      return ROOT_OPTIONS.filter(([o]) => o.startsWith(first)).map(([o, d]) => `${o}:${d}`);
    }
    const matching = Object.entries(COMMAND_TABLE)
      .filter(([k]) => k.startsWith(first))
      .map(([k, info]) => {
        const desc = Object.keys(info.verbs).length > 0 ? `commands for ${k}s` : `${k} command`;
        return `${k}:${desc}`;
      });
    if (matching.length > 0) return matching;
  }

  // Subcommand: completion itself
  if (first === "completion") {
    if (tokens.length <= 2) {
      const prefix = tokens[1] ?? "";
      if ("zsh".startsWith(prefix)) {
        return ["zsh:zsh completion script"];
      }
    }
    return [];
  }

  // Known noun
  if (first in COMMAND_TABLE) {
    const info = COMMAND_TABLE[first];
    const verbs = info.verbs;
    const hasVerbs = Object.keys(verbs).length > 0;

    // Subcase 1: Noun with subcommands at noun level (e.g. `memvector note <TAB>` or `memvector note se<TAB>`)
    if (hasVerbs && tokens.length === 2) {
      const prefix = tokens[1];
      if (prefix === "") {
        const verbList = Object.entries(verbs).map(([v, desc]) => `${v}:${desc}`);
        const nounMeta = [
          ["--commands", "list subcommands for this noun"],
          ["--help", "show help message"],
          ["-h", "show help message"],
        ];
        return [...verbList, ...nounMeta.map(([o, d]) => `${o}:${d}`)];
      }
      if (prefix.startsWith("-") && !prefix.includes("=")) {
        const nounMeta = [
          ["--commands", "list subcommands for this noun"],
          ["--help", "show help message"],
          ["-h", "show help message"],
        ];
        return nounMeta.filter(([o]) => o.startsWith(prefix)).map(([o, d]) => `${o}:${d}`);
      } else if (!prefix.startsWith("-")) {
        const matchingVerbs = Object.entries(verbs)
          .filter(([v]) => v.startsWith(prefix))
          .map(([v, desc]) => `${v}:${desc}`);
        if (matchingVerbs.length > 0) return matchingVerbs;
      }
    }

    // Subcase 2: Resolving verb (or empty verb for nouns without subcommands like `tools`)
    const verb = hasVerbs ? (tokens.length > 1 && tokens[1] in verbs ? tokens[1] : "") : "";
    if (hasVerbs && !verb) {
      // Require an explicit verb before suggesting verb-specific options
      return [];
    }

    const restTokens = hasVerbs ? tokens.slice(2) : tokens.slice(1);
    const lastToken = restTokens.length > 0 ? restTokens[restTokens.length - 1] : "";

    let availableOpts = VERB_OPTIONS[`${first}:${verb}`] ?? [];

    if (first === "note" && verb === "read") {
      const hasNeighbors = restTokens.includes("--neighbors");
      const hasContext = restTokens.includes("--context");
      if (hasNeighbors) {
        availableOpts = [
          ["--vault", "path to Obsidian vault directory"],
          ["--config-dir", "Obsidian configuration directory (.obsidian)"],
          ["--neighbors", "query graph neighbors for a note"],
          ["--note", "target note for graph neighbors"],
          ["--limit", "maximum neighbors to return (default 100)"],
          ["--json", "output structured JSON envelope"],
        ];
      } else if (hasContext) {
        availableOpts = [
          ["--vault", "path to Obsidian vault directory"],
          ["--config-dir", "Obsidian configuration directory (.obsidian)"],
          ["--context", "assemble 2D view synthesis context for seed notes"],
          ["--seed", "seed note for synthesis context (repeatable)"],
          ["--json", "output structured JSON envelope"],
        ];
      }
    }

    const availableOptionKeys = new Set(availableOpts.map(([o]) => o));

    // Equals-style option value (e.g. --vault=./path, --note=wiki/Ventil)
    if (lastToken.startsWith("--") && lastToken.includes("=")) {
      const [optName, valPrefix] = lastToken.split(/=(.*)/s, 2);
      if (VALUE_OPTIONS.has(optName) && availableOptionKeys.has(optName)) {
        const valCands = await completeOptionValue(optName, valPrefix, vault, configDir);
        return valCands.map((c) => `${optName}=${c}`);
      }
      return [];
    }

    // Check positional arguments and active option context
    const posArgs: string[] = [];
    let lastIsOptionValue = false;
    let prevOption: string | null = null;
    let idx = 0;

    while (idx < restTokens.length - 1) {
      const tok = restTokens[idx];
      if (VALUE_OPTIONS.has(tok)) {
        if (idx + 1 === restTokens.length - 1) {
          lastIsOptionValue = true;
          prevOption = tok;
          break;
        }
        idx += 2;
        continue;
      }
      if (tok.startsWith("--") && tok.includes("=")) {
        idx += 1;
        continue;
      }
      if (tok.startsWith("-")) {
        idx += 1;
        continue;
      }
      posArgs.push(tok);
      idx += 1;
    }

    if (lastIsOptionValue && prevOption !== null) {
      if (!availableOptionKeys.has(prevOption)) return [];
      return completeOptionValue(prevOption, lastToken, vault, configDir);
    }

    // If user is explicitly typing an option flag
    if (lastToken.startsWith("-")) {
      return availableOpts
        .filter(([o]) => o.startsWith(lastToken))
        .map(([o, d]) => `${o}:${d}`);
    }

    // Positional target completions
    const targetResults: string[] = [];

    // Note read takes positional note path (for --neighbors or --context)
    if (first === "note" && verb === "read") {
      const hasNeighbors = restTokens.includes("--neighbors");
      const hasNoteOption = restTokens.some((t) => t === "--note" || t.startsWith("--note="));
      const hasPositionalTarget = posArgs.length > 0;
      // In neighbors mode, at most one target is allowed
      const neighborsTargetAlreadySupplied = hasNeighbors && (hasNoteOption || hasPositionalTarget);
      if (!neighborsTargetAlreadySupplied) {
        const notes = await getNoteTargets(vault, configDir, lastToken);
        targetResults.push(...notes);
      }
    }

    // If no positional target matched or token is empty, suggest option flags too
    if (targetResults.length === 0 || lastToken === "") {
      const flags = availableOpts
        .filter(([o]) => !lastToken || o.startsWith(lastToken))
        .map(([o, d]) => `${o}:${d}`);
      targetResults.push(...flags);
    }

    return targetResults;
  }

  return [];
}
