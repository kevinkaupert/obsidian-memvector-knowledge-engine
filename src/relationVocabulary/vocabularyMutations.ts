import type { App } from "obsidian";
import { readVocabularyFileForUpdate, writeVocabularyFile } from "./presets";
import type { RelationTermDef } from "./types";

/** Returns the terms to write, or null to abort the mutation without writing. */
export type VocabularyTransform = (current: RelationTermDef[]) => RelationTermDef[] | null;

export type VocabularyMutationResult =
  /** Transform applied and file written. */
  | "written"
  /** Transform declined to write (e.g. duplicate label); the file is untouched. */
  | "skipped"
  /** File missing or unreadable - nothing was written. */
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
 * Purpose: Applies vocabulary file changes as serialized read-modify-write cycles, so no
 * mutation is ever built from a stale snapshot of the terms.
 * Architecture: The Settings type table renders once and would otherwise rebuild the whole
 * file from the array captured at that moment. Every later mutation then resurrects the state
 * from render time: a second weight edit reverts the first, and deleting or adding a row
 * reverts every edit made since the panel was opened. Re-reading per mutation also keeps
 * edits made outside the panel (or in a second window) intact. The internal queue serializes
 * overlapping mutations, because two concurrent cycles would otherwise read the same state and
 * the later write would drop the earlier one.
 */
export function createVocabularyMutator(app: App, path: string): VocabularyMutator {
  let queue: Promise<VocabularyMutation> = Promise.resolve({ result: "written" as const });

  const run = async (transform: VocabularyTransform): Promise<VocabularyMutation> => {
    const current = await readVocabularyFileForUpdate(app, path);
    if (current === null) return { result: "read-failed" };

    const next = transform(current);
    if (next === null) return { result: "skipped" };

    try {
      await writeVocabularyFile(app, path, next);
      return { result: "written" };
    } catch (error) {
      return { result: "write-failed", error };
    }
  };

  return {
    mutate(transform: VocabularyTransform): Promise<VocabularyMutation> {
      // Chain off the previous mutation regardless of its outcome, so one failure
      // does not wedge the queue for every following edit.
      const next = queue.then(
        () => run(transform),
        () => run(transform)
      );
      queue = next;
      return next;
    },
  };
}
