import { readFileSync, realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import type { ReadNote, SearchResult } from "./search";

/** Purpose: Helpers of the agent-facing CLI (knowOS ADR-0014): the envelope and reading notes inside the vault only. */

/** A search result as the agent envelope of knowOS ADR-0014 §1. */
export function searchEnvelope(result: SearchResult): Record<string, unknown> {
  if (result.outcome === "error") return { v: 1, outcome: "error", error: { code: result.code, message: result.error } };
  const { outcome: _outcome, ...data } = result;
  return { v: 1, outcome: "ok", data };
}

/**
 * Reads a note by its vault-relative path, only inside the vault: a path or symlink that resolves outside it, a
 * missing or unreadable file read as null (the hit then keeps the index's stored start of the note).
 */
export function vaultReader(vault: string): ReadNote {
  let root: string;
  try {
    root = realpathSync(resolve(vault));
  } catch {
    return () => null;
  }
  return (path) => {
    try {
      const real = realpathSync(resolve(root, path));
      const rel = relative(root, real);
      if (!rel || rel.startsWith(`..${sep}`) || rel === ".." || resolve(root, rel) !== real) return null;
      return readFileSync(real, "utf8");
    } catch {
      return null;
    }
  };
}

