import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { de } from "../i18n/de";
import { buildRelationFileContent, relationFilePath } from "../modals/relationBuilder/relationFileTemplate";
import { parseFrontmatter } from "../frontmatterYaml";
import { isUlid } from "../noteKey";
import { pathToId } from "../noteSlug";
import { JOVIAN_GATE_CALL_TIMEOUT_MS, resolveGateInvocation, runGate, type GateSpawn } from "../noteWriter/jovianGate";
import { DEFAULT_RELATION_VOCABULARY_PATH, DEFAULT_RELATIONS_FOLDER } from "../vaultLayout";

/**
 * Purpose: `memvector relation add` (knowOS ADR-0013 §5, Plan 0016 block C): the relation note for one edge between
 * two notes, with the user's thoughts as its reason, written through Jovian's gate. An existing relation note for
 * the same (from, relation, to) is answered with its path, never duplicated.
 * Architecture: Runs without Obsidian. The note is built by the Relation Builder's template (same frontmatter, same
 * file name), so the plugin reads and edits it like one it made. Note keys follow noteKey.ts: a unique frontmatter
 * ULID, else the path key. The write is always through the gate (`create_new`); without Jovian nothing is written.
 */

export interface RelationAddRequest {
  from: string;
  to: string;
  relation: string;
  text?: string;
}

export interface RelationAddResult {
  outcome: "ok" | "error";
  path?: string;
  created?: boolean;
  code?: string;
  error?: string;
}

interface VaultNote {
  path: string;
  frontmatter: Record<string, unknown>;
}

const LABEL = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Every Markdown note of the vault with its parsed frontmatter; folders starting with `.` are skipped. */
export function readVaultNotes(vault: string): VaultNote[] {
  const notes: VaultNote[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      if (name.startsWith(".")) continue;
      const full = join(dir, name);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (name.toLowerCase().endsWith(".md")) {
        const path = relative(vault, full).split(sep).join("/");
        notes.push({ path, frontmatter: parseFrontmatter(readFileSync(full, "utf8")) ?? {} });
      }
    }
  };
  walk(vault);
  return notes;
}

/** The key MemVector stores a note under (noteKey.ts): its frontmatter ULID when unique in the vault, else the path key. */
export function noteKeys(notes: VaultNote[]): Map<string, string> {
  const owners = new Map<string, string[]>();
  for (const note of notes) {
    const id = note.frontmatter.id;
    if (isUlid(id)) owners.set(id.toUpperCase(), [...(owners.get(id.toUpperCase()) ?? []), note.path]);
  }
  const keys = new Map<string, string>();
  for (const note of notes) {
    const id = note.frontmatter.id;
    const paths = isUlid(id) ? owners.get(id.toUpperCase()) ?? [] : [];
    // the note whose path sorts first keeps a duplicated id, as in buildNoteKeyIndex
    keys.set(note.path, isUlid(id) && [...paths].sort()[0] === note.path ? id.toUpperCase() : pathToId(note.path));
  }
  return keys;
}

/** The note a `[[link|alias]]` in a relation note's frontmatter names, compared without `.md`, case and heading. */
function linkNames(value: unknown, path: string): boolean {
  if (typeof value !== "string") return false;
  const match = value.match(/\[\[([^\]|#]+)/);
  if (!match) return false;
  const inner = match[1].trim().replace(/\.md$/i, "").toLowerCase();
  const noExt = path.replace(/\.md$/i, "").toLowerCase();
  return inner === noExt || inner === noExt.split("/").pop();
}

/** The active vocabulary's term for a label (bidirectional, chosen term), read like Canvas Tutor does (knowos.json). */
function termOf(vault: string, settings: Record<string, unknown>, label: string): { bidirectional: boolean; term: string } {
  let path = typeof settings.relationVocabularyPath === "string" && settings.relationVocabularyPath.trim()
    ? settings.relationVocabularyPath.trim() : DEFAULT_RELATION_VOCABULARY_PATH;
  try {
    const knowos = JSON.parse(readFileSync(join(vault, "knowos.json"), "utf8")) as Record<string, unknown>;
    if (typeof knowos.relation_vocabulary === "string" && knowos.relation_vocabulary.trim()) path = knowos.relation_vocabulary.trim();
  } catch {
    // no knowos.json: MemVector's own setting
  }
  try {
    const terms = (JSON.parse(readFileSync(join(vault, path), "utf8")) as { terms?: unknown }).terms;
    const term = Array.isArray(terms)
      ? (terms as Array<Record<string, unknown>>).find((t) => typeof t?.label === "string" && t.label.toUpperCase() === label)
      : undefined;
    if (term) return { bidirectional: term.bidirectional === true, term: typeof term.term === "string" ? term.term : label };
  } catch {
    // unreadable vocabulary: a directed edge named by its label
  }
  return { bidirectional: false, term: label };
}

function titleOf(note: VaultNote): string {
  const title = note.frontmatter.title;
  return typeof title === "string" && title.trim() ? title.trim() : note.path.replace(/\.md$/i, "").split("/").pop() ?? note.path;
}

function typeOf(note: VaultNote): string {
  return typeof note.frontmatter.type === "string" ? note.frontmatter.type : "";
}

export async function relationAdd(
  vault: string,
  request: unknown,
  settings: Record<string, unknown>,
  options: { spawn?: GateSpawn; clientVersion: string; timeoutMs?: number }
): Promise<RelationAddResult> {
  const fail = (code: string, error: string): RelationAddResult => ({ outcome: "error", code, error });
  if (!request || typeof request !== "object" || Array.isArray(request)) return fail("INVALID_REQUEST", "The request must be a JSON object.");
  const req = request as Record<string, unknown>;
  if (req.v !== 1) return fail("INVALID_REQUEST", `'v' must be 1, got ${JSON.stringify(req.v)}.`);
  for (const key of ["from", "to", "relation"]) {
    const value = req[key];
    if (typeof value !== "string" || !value.trim()) return fail("INVALID_REQUEST", `'${key}' must be a non-empty string.`);
  }
  if (req.text !== undefined && typeof req.text !== "string") return fail("INVALID_REQUEST", "'text' must be a string.");
  const relation = (req.relation as string).trim();
  if (!LABEL.test(relation)) return fail("INVALID_REQUEST", `'relation' must be a relation label such as REQUIRES, got ${JSON.stringify(relation)}.`);
  const label = relation.toUpperCase();

  const root = resolve(vault);
  const notes = readVaultNotes(root);
  const find = (path: string) => notes.find((n) => n.path === path.replace(/^\/+/, ""));
  const from = find(req.from as string);
  const to = find(req.to as string);
  if (!from) return fail("NOTE_NOT_FOUND", `Note '${String(req.from)}' does not exist.`);
  if (!to) return fail("NOTE_NOT_FOUND", `Note '${String(req.to)}' does not exist.`);

  const existing = notes.find((n) =>
    typeof n.frontmatter.type === "string" && n.frontmatter.type.toLowerCase() === "relation"
    && typeof n.frontmatter.relation_type === "string" && n.frontmatter.relation_type.toUpperCase() === label
    && linkNames(n.frontmatter.source_note, from.path) && linkNames(n.frontmatter.target_note, to.path));
  if (existing) return { outcome: "ok", path: existing.path, created: false };

  const keys = noteKeys(notes);
  const term = termOf(root, settings, label);
  const edge = {
    src: { id: keys.get(from.path) ?? pathToId(from.path), title: titleOf(from), path: from.path, type: typeOf(from) },
    tgt: { id: keys.get(to.path) ?? pathToId(to.path), title: titleOf(to), path: to.path, type: typeOf(to) },
    label,
    bidirectional: term.bidirectional,
    originalTerm: term.term,
  };
  const folder = typeof settings.relationsFolder === "string" && settings.relationsFolder.trim()
    ? settings.relationsFolder.trim().replace(/^\/+|\/+$/g, "") : DEFAULT_RELATIONS_FOLDER;
  const path = await relationFilePath(edge, folder);
  if (existsSync(join(root, path))) return { outcome: "ok", path, created: false };

  const content = buildRelationFileContent(edge, typeof req.text === "string" ? req.text.trim() : "", de);
  const jovianCommand = typeof settings.jovianCommand === "string" ? settings.jovianCommand : "";
  let invocation;
  try {
    invocation = resolveGateInvocation(jovianCommand, process.env.HOME ?? "");
  } catch (err) {
    return fail("GATE_UNAVAILABLE", err instanceof Error ? err.message : String(err));
  }
  const call = await runGate(invocation, ["write", "--vault", root, "--json"], {
    v: 1,
    client: { component: "memvector", version: options.clientVersion },
    target: path,
    content,
    mode: "create_new",
    expected_hash: null,
    declared_removals: [],
    operation: "memvector.relation_save",
    request_id: crypto.randomUUID(),
  }, options.timeoutMs ?? JOVIAN_GATE_CALL_TIMEOUT_MS, options.spawn);
  if (call.result?.outcome === "ok") return { outcome: "ok", path, created: true };
  const error = call.result?.error;
  if (error) return fail(typeof error.code === "string" ? error.code : "GATE_ERROR", typeof error.message === "string" ? error.message : "The gate refused the write.");
  return fail("GATE_UNAVAILABLE", call.problem ?? "Jovian's gate did not answer.");
}
