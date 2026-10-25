import BUILTIN_FILE from "./knowos-contract/note-kinds.json";

/**
 * Purpose: The colors of the kinds of thought in effect for a vault (knowOS ADR-0016, note kinds contract), so the 2D
 * view and the sidebar radar color a note by its frontmatter `type`.
 * Architecture: `knowos.json` names a kinds file (`note_kinds`); without it, or when it is unusable, the built-in
 * kinds apply: `knowos-contract/note-kinds.json`, an unchanged copy of knowOS `docs/contracts/note-kinds.json`,
 * checked byte for byte by knowOS. The checks are the contract's, the same as Jovian's `kinds.py` and Canvas Tutor's
 * `kinds.ts`. The plugin resolves the colors and stores them here; renderers read them with `noteTypeColor`.
 */

export const KINDS_KEY = "note_kinds";
export const NEUTRAL_TYPE_COLOR = "#8a8f97";
const FIXED_TYPES = ["hub", "relation", "synthesis"];
/** Colors of the vault schema's fixed types; `hub` keeps MemVector's former `concept` gold. */
const FIXED_COLORS: Record<string, string> = { hub: "#c9a25e", relation: "#a897c9", synthesis: "#c98fae" };
const TYPE = /^[a-z][a-z0-9_]*$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

export interface ActiveKindColors {
  /** `type` -> color of every kind that has one (deprecated kinds included: their notes still exist). */
  colors: Record<string, string>;
  source: "builtin" | "file";
  path?: string;
  /** Why the named file (or knowos.json) was not used. */
  problem?: string;
}

/** The vault-relative kinds file `knowos.json` names, and why `knowos.json` itself is unusable. */
export function kindsPathFromKnowos(raw: string | null): { path: string | null; problem: string | null } {
  if (raw === null) return { path: null, problem: null };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return { path: null, problem: `knowos.json cannot be read: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return { path: null, problem: "knowos.json is not a JSON object" };
  const value = (data as Record<string, unknown>)[KINDS_KEY];
  if (typeof value !== "string" || !value.trim()) return { path: null, problem: null };
  const path = value.trim().replace(/^\/+/, "");
  if (value.trim().startsWith("/") || path.split("/").includes("..")) {
    return { path: null, problem: `${value.trim()}: the kinds file path leaves the vault` };
  }
  return { path, problem: null };
}

const fold = (name: string): string => name.split(/\s+/).filter(Boolean).join(" ").toLowerCase();

/** The problems that make a kinds file unusable (contract §2-§4); empty when it can be used. */
export function kindsProblems(data: unknown): string[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return ["the kinds file is not a JSON object"];
  const kinds = (data as { kinds?: unknown }).kinds;
  if (!Array.isArray(kinds)) return ["'kinds' is not a list"];
  const problems: string[] = [];
  const types = new Set<string>();
  const names = new Set<string>();
  kinds.forEach((raw, i) => {
    const where = `kind ${i + 1}`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      problems.push(`${where} is not an object`);
      return;
    }
    const k = raw as Record<string, unknown>;
    if (typeof k.type !== "string" || !TYPE.test(k.type)) problems.push(`${where}: 'type' must be lowercase letters, digits or _`);
    else if (FIXED_TYPES.includes(k.type)) problems.push(`${where}: '${k.type}' is a fixed type of the vault schema, not a kind`);
    else if (types.has(k.type)) problems.push(`${where}: type '${k.type}' is used twice`);
    else types.add(k.type);
    let aliases: string[] = [];
    if (k.aliases !== undefined) {
      if (Array.isArray(k.aliases) && k.aliases.every((a) => typeof a === "string" && a.trim())) aliases = k.aliases as string[];
      else problems.push(`${where}: 'aliases' must be a list of names`);
    }
    const name = typeof k.name === "string" && k.name.trim() ? k.name : null;
    if (!name) problems.push(`${where}: 'name' is missing`);
    for (const n of [...(name ? [name] : []), ...aliases]) {
      if (names.has(fold(n))) problems.push(`${where}: name '${n}' is used twice`);
      names.add(fold(n));
    }
    if ("hub_section" in k && !(typeof k.hub_section === "string" && k.hub_section.trim())) problems.push(`${where}: 'hub_section' must be a non-empty text`);
    if ("color" in k && !(typeof k.color === "string" && COLOR.test(k.color))) problems.push(`${where}: 'color' must be #rrggbb`);
    if ("deprecated" in k && typeof k.deprecated !== "boolean") problems.push(`${where}: 'deprecated' must be true or false`);
  });
  return problems;
}

function colorsOf(data: unknown): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const k of (data as { kinds: Array<{ type: string; color?: string }> }).kinds) if (k.color) colors[k.type] = k.color;
  return colors;
}

export const BUILTIN_KIND_COLORS: Record<string, string> = colorsOf(BUILTIN_FILE);

/** The kind colors in effect: `fileData` is the parsed file named by `path` (undefined when it is missing). */
export function resolveKindColors(path: string | null, fileData: unknown, knowosProblem: string | null = null): ActiveKindColors {
  const builtin = (problem?: string): ActiveKindColors => ({ colors: { ...BUILTIN_KIND_COLORS }, source: "builtin", path: path ?? undefined, problem });
  if (knowosProblem) return builtin(knowosProblem);
  if (!path) return builtin();
  if (fileData === undefined) return builtin(`${path} does not exist`);
  const problems = kindsProblems(fileData);
  if (problems.length > 0) return builtin(`${path}: ${problems.join("; ")}`);
  return { colors: colorsOf(fileData), source: "file", path };
}

let active: ActiveKindColors = resolveKindColors(null, undefined);

/** Called by the plugin after it resolved the kinds of the vault. */
export function setActiveKindColors(next: ActiveKindColors): void {
  active = next;
}

export function activeKindColors(): ActiveKindColors {
  return active;
}

/**
 * The color of a note `type`: the active kind's color, else a fixed type's, else neutral. Old values such as
 * `concept` and untyped notes are neutral (contract §4.2); a vault kinds file can give them a color.
 */
export function noteTypeColor(type: string | undefined, colors: Record<string, string> = active.colors): string {
  const key = (type ?? "").trim().toLowerCase();
  return colors[key] ?? FIXED_COLORS[key] ?? NEUTRAL_TYPE_COLOR;
}
