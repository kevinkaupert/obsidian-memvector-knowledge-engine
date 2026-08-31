import { TFile, type App } from "obsidian";
import { ensureParentFolder } from "../../ensureFolder";

export async function writeRelationFile(app: App, path: string, content: string): Promise<void> {
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) {
    await app.vault.modify(existing, content);
    return;
  }

  await ensureParentFolder(app, path);
  await app.vault.create(path, content);
}
