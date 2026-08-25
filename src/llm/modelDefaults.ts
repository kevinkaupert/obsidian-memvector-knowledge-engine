import type { LlmProvider } from "../settings/types";

/**
 * Single source of truth for model IDs. The original bundle had these
 * scattered across ~4 call sites, which is why stale/fabricated IDs
 * (claude-opus-5, claude-sonnet-4-6 — neither is a real model) survived
 * one "fix the model list" pass without being caught elsewhere. Update
 * model IDs here only.
 */
export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-5";

export const ANTHROPIC_FALLBACK_MODELS: readonly string[] = [
  "claude-opus-4-8",
  "claude-sonnet-5",
  "claude-fable-5",
  "claude-haiku-4-5-20251001",
];

export const PROVIDER_DEFAULT_MODELS: Record<LlmProvider, string> = {
  claude: ANTHROPIC_DEFAULT_MODEL,
  deepseek: "deepseek-reasoner",
  openai: "gpt-4o",
  openrouter: "anthropic/claude-sonnet-5",
  ollama: "deepseek-r1:7b",
  custom: "",
};

export function getDefaultModelFor(provider: LlmProvider): string {
  return PROVIDER_DEFAULT_MODELS[provider] ?? PROVIDER_DEFAULT_MODELS.ollama;
}
