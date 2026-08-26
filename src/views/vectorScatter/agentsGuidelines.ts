import { TFile, type App } from "obsidian";

/** Vault-level "how an agent should compile knowledge here" documents - loaded only if present, never required. */
const CANDIDATE_PATHS = ["AGENTS.md", "meta/PROFILE.md"];

/** Returns the concatenated content of whichever candidate files exist in this vault, or an empty string if none do. */
export async function loadAgentsGuidelines(app: App): Promise<string> {
  const sections: string[] = [];
  for (const path of CANDIDATE_PATHS) {
    const file = app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      const content = await app.vault.read(file);
      sections.push(`### ${path}\n\n${content}`);
    }
  }
  return sections.join("\n\n---\n\n");
}
