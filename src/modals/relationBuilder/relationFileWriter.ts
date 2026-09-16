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

/**
 * Purpose: Writes or updates relation markdown file content, ensuring the parent directory exists.
 */
export async function writeRelationFile(app: App, path: string, content: string): Promise<void> {
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) {
    await app.vault.modify(existing, content);
    return;
  }

  await ensureParentFolder(app, path);
  await app.vault.create(path, content);
}
