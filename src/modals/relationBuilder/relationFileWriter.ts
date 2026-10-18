import { TFile, type App } from "obsidian";
import { ensureParentFolder } from "../../ensureFolder";
import { mergeRelationNoteContent } from "../../frontmatterYaml";
import { createNativeWriter, type NoteWriter } from "../../noteWriter/noteWriter";

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

/**
 * Only the explicitly edited file may be modified; new relations always use create(). Foreign frontmatter and custom
 * body are preserved (#246). `writer` is native or Jovian's gate (#274).
 */
export async function writeRelationFile(
  app: App,
  path: string,
  content: string,
  initialEdgePath?: string,
  writer: NoteWriter = createNativeWriter(app)
): Promise<void> {
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing) {
    if (!(existing instanceof TFile) || path !== initialEdgePath) {
      throw new Error(`Relation file already exists: ${path}`);
    }
    await writer.update(existing, (existingContent) => mergeRelationNoteContent(existingContent, content), "memvector.relation_save");
    return;
  }

  let finalContent = content;
  if (initialEdgePath) {
    const initialFile = app.vault.getAbstractFileByPath(initialEdgePath);
    if (initialFile instanceof TFile) {
      const existingContent = await app.vault.read(initialFile);
      finalContent = mergeRelationNoteContent(existingContent, content);
    }
  }

  await ensureParentFolder(app, path);
  // If another writer wins the race, create rejects instead of overwriting its file (the gate: TARGET_EXISTS).
  await writer.create(path, finalContent, "memvector.relation_save");
}
