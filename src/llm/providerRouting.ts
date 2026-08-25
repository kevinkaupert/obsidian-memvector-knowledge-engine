export type DetectedProvider = "anthropic" | "deepseek" | "openai" | "openrouter" | "generic";

/**
 * Single source of truth for "which provider is this?", used by both the
 * chat-completion call and the model-listing call. The original bundle had
 * two slightly different ad-hoc checks for this (one ignored `llmProvider`,
 * the other didn't) — unified here so they can never drift apart again.
 */
export function detectProvider(apiBase: string, modelName: string, llmProvider = ""): DetectedProvider {
  const rawBase = (apiBase || "").toLowerCase().trim();
  const rawModel = (modelName || "").toLowerCase().trim();
  const rawProvider = (llmProvider || "").toLowerCase().trim();

  if (
    rawBase.includes("anthropic") ||
    rawModel.includes("claude") ||
    rawModel.includes("sonnet") ||
    rawProvider.includes("claude")
  ) {
    return "anthropic";
  }
  if (rawBase.includes("deepseek")) return "deepseek";
  if (rawBase.includes("openai")) return "openai";
  if (rawBase.includes("openrouter")) return "openrouter";
  return "generic";
}

function stripKnownSuffix(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/\/(messages|chat\/completions|models)$/i, "");
}

export function buildChatCompletionsUrl(provider: DetectedProvider, apiBase: string): string {
  switch (provider) {
    case "anthropic":
      return "https://api.anthropic.com/v1/messages";
    case "deepseek":
      return "https://api.deepseek.com/v1/chat/completions";
    case "openai":
      return "https://api.openai.com/v1/chat/completions";
    case "openrouter":
      return "https://openrouter.ai/api/v1/chat/completions";
    default:
      return `${stripKnownSuffix(apiBase || "http://localhost:11434/v1")}/chat/completions`;
  }
}

export function buildModelsUrl(provider: DetectedProvider, apiBase: string): string {
  if (provider === "anthropic") return "https://api.anthropic.com/v1/models";
  const cleanUrl = stripKnownSuffix(apiBase || "http://localhost:11434/v1");
  return cleanUrl.endsWith("/models") ? cleanUrl : `${cleanUrl}/models`;
}
