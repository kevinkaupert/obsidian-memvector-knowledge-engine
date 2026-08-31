export type DetectedProvider = "anthropic" | "deepseek" | "openai" | "openrouter" | "generic";

/**
 * Single source of truth for "which provider is this?", used by both the
 * chat-completion call and the model-listing call.
 */
export function detectProvider(apiBase: string, modelName: string, llmProvider = ""): DetectedProvider {
  const rawBase = (apiBase || "").toLowerCase().trim();
  const rawModel = (modelName || "").toLowerCase().trim();
  const rawProvider = (llmProvider || "").toLowerCase().trim();

  if (rawProvider === "openrouter" || rawBase.includes("openrouter")) return "openrouter";
  if (rawProvider === "deepseek" || rawBase.includes("deepseek")) return "deepseek";
  if (rawProvider === "openai" || rawBase.includes("openai")) return "openai";
  if (
    rawProvider === "claude" ||
    rawBase.includes("anthropic") ||
    rawModel.includes("claude") ||
    rawModel.includes("sonnet")
  ) {
    return "anthropic";
  }
  return "generic";
}

function stripKnownSuffix(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/\/(messages|chat\/completions|models)$/i, "");
}

export function buildChatCompletionsUrl(provider: DetectedProvider, apiBase: string): string {
  if (provider === "anthropic") {
    if (!apiBase || apiBase.includes("anthropic.com")) {
      return "https://api.anthropic.com/v1/messages";
    }
    const clean = stripKnownSuffix(apiBase);
    return clean.endsWith("/messages") ? clean : `${clean}/messages`;
  }

  if (provider === "deepseek" && (!apiBase || apiBase.includes("deepseek.com"))) {
    return "https://api.deepseek.com/v1/chat/completions";
  }
  if (provider === "openai" && (!apiBase || apiBase.includes("openai.com"))) {
    return "https://api.openai.com/v1/chat/completions";
  }
  if (provider === "openrouter" && (!apiBase || apiBase.includes("openrouter.ai"))) {
    return "https://openrouter.ai/api/v1/chat/completions";
  }

  const clean = stripKnownSuffix(apiBase || "http://localhost:11434/v1");
  return clean.endsWith("/chat/completions") ? clean : `${clean}/chat/completions`;
}

export function buildModelsUrl(provider: DetectedProvider, apiBase: string): string {
  if (provider === "anthropic" && (!apiBase || apiBase.includes("anthropic.com"))) {
    return "https://api.anthropic.com/v1/models";
  }
  const cleanUrl = stripKnownSuffix(apiBase || "http://localhost:11434/v1");
  return cleanUrl.endsWith("/models") ? cleanUrl : `${cleanUrl}/models`;
}

