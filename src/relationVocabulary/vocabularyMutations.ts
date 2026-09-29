import { TFile, type App } from "obsidian";
import { isValidTerm } from "./loadRelationVocabulary";
import type { RelationTermDef, RelationVocabularyFile } from "./types";

/** Returns the terms to write, or null to abort the mutation without changing the file. */
export type VocabularyTransform = (current: RelationTermDef[]) => RelationTermDef[] | null;

export type VocabularyMutationResult =
  /** Transform applied and file written. */
  | "written"
  /** Transform declined to write (e.g. duplicate label); contents are left as they were. */
  | "skipped"
  /** File missing or unparseable - nothing was written. */
  | "read-failed"
  /** Read succeeded but the write failed; `error` carries the cause. */
  | "write-failed";

export interface VocabularyMutation {
  result: VocabularyMutationResult;
  error?: unknown;
}

export interface VocabularyMutator {
  mutate(transform: VocabularyTransform): Promise<VocabularyMutation>;
}

/**
 * Purpose: Applies a change to a vocabulary file as one atomic read-modify-write, so the written
 * result is always derived from the file's contents at write time.
 * Architecture: Rebuilding the file from the terms captured when the Settings table was rendered
 * resurrects that snapshot on every write, which silently drops every edit made since. Reading
 * the file again just before writing is not enough either: between a separate read and write,
 * another table instance or a concurrent handler can commit a change that the later write then
 * overwrites. Vault.process performs the whole cycle atomically within the vault, which also
 * makes the guarantee hold across every table instance without a shared queue of our own.
 * Remaining limitation: a writer that edits the file outside the vault API is not covered.
 */
export function createVocabularyMutator(app: App, path: string): VocabularyMutator {
  return {
    async mutate(transform: VocabularyTransform): Promise<VocabularyMutation> {
      const file = app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) return { result: "read-failed" };

      // Set from inside the callback: the transform runs synchronously within the
      // atomic section, so its outcome has to be carried back out.
      let outcome: VocabularyMutationResult = "written";

      try {
        await app.vault.process(file, (raw) => {
          let parsed: Partial<RelationVocabularyFile>;
          try {
            parsed = JSON.parse(raw) as Partial<RelationVocabularyFile>;
          } catch {
            // An unreadable file must never be reinterpreted as an empty vocabulary:
            // writing that out would drop every type the file still holds.
            outcome = "read-failed";
            return raw;
          }
          if (!Array.isArray(parsed.terms)) {
            outcome = "read-failed";
            return raw;
          }

          const next = transform(parsed.terms.filter(isValidTerm));
          if (next === null) {
            outcome = "skipped";
            return raw;
          }
          return JSON.stringify({ terms: next } satisfies RelationVocabularyFile, null, 2);
        });
      } catch (error) {
        return { result: "write-failed", error };
      }

      return { result: outcome };
    },
  };
}
