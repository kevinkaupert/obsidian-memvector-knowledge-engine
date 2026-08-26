import { TFile, type App } from "obsidian";
import { stripFrontmatter } from "../../noteContent";

/** Vault-level "how an agent should compile knowledge here" documents - loaded only if present, never required. */
const CANDIDATE_PATHS = ["AGENTS.md", "meta/PROFILE.md"];

/** Per-file char budget. Many local LLMs (e.g. Ollama) serve well under their architectural
 * context size (often 4096 tokens) unless explicitly reconfigured, so this stays small enough
 * to leave headroom for the actual note content and question in the rest of the prompt. */
const MAX_CHARS_PER_FILE = 2400;

/** Returns the concatenated, size-capped content of whichever candidate files exist in this vault, or an empty string if none do. */
export async function loadAgentsGuidelines(app: App): Promise<string> {
  const sections: string[] = [];
  for (const path of CANDIDATE_PATHS) {
    const file = app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      const content = stripFrontmatter(await app.vault.read(file)).trim();
      const truncated = content.length > MAX_CHARS_PER_FILE;
      const body = truncated ? `${content.slice(0, MAX_CHARS_PER_FILE)}\n[...gekürzt...]` : content;
      sections.push(`### ${path}\n\n${body}`);
    }
  }
  return sections.join("\n\n---\n\n");
}
