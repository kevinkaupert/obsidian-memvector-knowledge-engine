import { TFolder, type App } from "obsidian";

/** vault.create() throws if its parent folder doesn't exist yet (it doesn't auto-create one) - a fresh vault missing e.g. wiki/relations/ or wiki/synthesis/ would fail on the very first file ever written there. Call before any vault.create() whose path may be under a not-yet-existing folder. */
export async function ensureParentFolder(app: App, path: string): Promise<void> {
  const folderPath = path.slice(0, path.lastIndexOf("/"));
  if (!folderPath || app.vault.getAbstractFileByPath(folderPath) instanceof TFolder) return;
  try {
    await app.vault.createFolder(folderPath);
  } catch {
    // Already exists (race with another writer) or otherwise unavailable - the create() call after this will surface any real problem.
  }
}
