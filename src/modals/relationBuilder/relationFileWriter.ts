import { TFile, type App } from "obsidian";
import { ensureParentFolder } from "../../ensureFolder";

/**
 * Purpose: Checks whether a target relation file path already exists in the vault and belongs to a different relation, preventing destructive overwrites.
 */
export function findRelationPathConflict(
  app: App,
  targetPath: string,
  initialEdgePath?: string
): boolean {
  if (initialEdgePath && targetPath === initialEdgePath) {
    return false;
  }
  const existing = app.vault.getAbstractFileByPath(targetPath);
  return existing instanceof TFile;
}

/** Checks the complete batch before any writes, including collisions between its entries. */
export function findRelationBatchConflict(app: App, paths: string[], initialEdgePath?: string): string | undefined {
  const seen = new Set<string>();
  return paths.find((path, index) => {
    if (seen.has(path)) return true;
    seen.add(path);
    return findRelationPathConflict(app, path, index === 0 ? initialEdgePath : undefined);
  });
}

/** Only the explicitly edited file may be modified; new relations always use create(). */
export async function writeRelationFile(app: App, path: string, content: string, initialEdgePath?: string): Promise<void> {
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing) {
    if (!(existing instanceof TFile) || path !== initialEdgePath) {
      throw new Error(`Relation file already exists: ${path}`);
    }
    await app.vault.modify(existing, content);
    return;
  }

  await ensureParentFolder(app, path);
  // If another writer wins the race, create rejects instead of overwriting its file.
  await app.vault.create(path, content);
}
