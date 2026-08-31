import { type App } from "obsidian";
import { callDirectLLM } from "../llm/callDirectLLM";
import { stripFrontmatter } from "../noteContent";
import { getApiKeyFor } from "../settings/secrets";
import type { MemVectorSettings } from "../settings/types";
import {
  buildEdgeSuggestionPrompt,
  buildEdgeVerificationPrompt,
  LEAN_CLASSIFIER_SYSTEM_PROMPT,
  parseEdgeSuggestion,
  parseEdgeVerification,
  suggestableLabels,
  type EdgeSuggestion,
  type EdgeVerification,
  type NoteRef,
} from "./llmSuggestPrompt";
import type { RelationTermDef } from "./types";

/** Short, frontmatter-free excerpt for the prompt - stays lean regardless of how long the actual note is. */
export async function readExcerpt(app: App, path: string, maxChars = 220): Promise<string> {
  const file = app.vault.getAbstractFileByPath(path);
  if (!file || !("extension" in file)) return "";
  const content = stripFrontmatter(await app.vault.read(file as never)).trim();
  return content.slice(0, maxChars);
}

/** Reuses whichever LLM provider/model/key is already configured in Settings (Ollama, Claude, etc.) - not hardcoded to any specific model, so a small local model is a user choice, not a plugin assumption. */
export async function requestEdgeSuggestion(app: App, settings: MemVectorSettings, defs: RelationTermDef[], nodeA: NoteRef, nodeB: NoteRef): Promise<EdgeSuggestion | null> {
  const [excerptA, excerptB] = await Promise.all([readExcerpt(app, nodeA.path), readExcerpt(app, nodeB.path)]);
  const prompt = buildEdgeSuggestionPrompt(defs, nodeA.title, excerptA, nodeB.title, excerptB);
  const raw = await callDirectLLM(
    prompt,
    settings.apiBaseUrl || "http://localhost:11434/v1",
    getApiKeyFor(app, settings.llmProvider),
    settings.modelName || "LLM",
    0.1,
    LEAN_CLASSIFIER_SYSTEM_PROMPT
  );
  return parseEdgeSuggestion(
    raw,
    suggestableLabels(defs).map((l) => l.label)
  );
}

export async function requestEdgeVerification(app: App, settings: MemVectorSettings, label: string, nodeA: NoteRef, nodeB: NoteRef): Promise<EdgeVerification | null> {
  const [excerptA, excerptB] = await Promise.all([readExcerpt(app, nodeA.path), readExcerpt(app, nodeB.path)]);
  const prompt = buildEdgeVerificationPrompt(label, nodeA.title, excerptA, nodeB.title, excerptB);
  const raw = await callDirectLLM(
    prompt,
    settings.apiBaseUrl || "http://localhost:11434/v1",
    getApiKeyFor(app, settings.llmProvider),
    settings.modelName || "LLM",
    0.1,
    LEAN_CLASSIFIER_SYSTEM_PROMPT
  );
  return parseEdgeVerification(raw);
}
