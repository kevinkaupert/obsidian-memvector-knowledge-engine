import { TFile, type App } from "obsidian";
import { stripFrontmatter } from "../../noteContent";
import type { MemVectorSettings } from "../../settings/types";

/** Vault-level "how an agent should compile knowledge here" documents - configurable in Settings, loaded only if present, never required. */
const DEFAULT_CANDIDATE_PATHS = ["AGENTS.md", "meta/PROFILE.md"];

/** Per-file char budget for guidelines to keep prompt compact and prevent context overflows. */
const MAX_CHARS_PER_FILE = 500;

function parseCandidatePaths(raw: string | undefined): string[] {
  const paths = (raw || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return paths.length > 0 ? paths : DEFAULT_CANDIDATE_PATHS;
}

/** Returns the concatenated, size-capped content of whichever candidate files (from settings.agentsGuidelinePaths, comma-separated) exist in this vault, or an empty string if none do. */
export async function loadAgentsGuidelines(app: App, settings: Pick<MemVectorSettings, "agentsGuidelinePaths">): Promise<string> {
  const sections: string[] = [];
  for (const path of parseCandidatePaths(settings.agentsGuidelinePaths)) {
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
