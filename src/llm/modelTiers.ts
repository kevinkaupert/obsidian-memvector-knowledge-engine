export type ModelTier = "compact" | "standard" | "frontier";

/**
 * Purpose: Detects the capacity tier of the currently configured LLM to adapt synthesis prompt depth and wording.
 * Architecture: Prompt style only (formula count, rigor wording) - all context limits are user settings with 0 = unlimited (Issue #103); the tier no longer provides hidden budgets.
 * - compact: 1.5B - 8B local models
 * - standard: 14B - 32B models
 * - frontier: Claude, GPT-4o, DeepSeek-V3/R1, 70B+ models (deep GraphRAG context)
 */
export function detectModelTier(modelName: string | undefined, provider: string | undefined): ModelTier {
  const model = (modelName || "").toLowerCase().trim();
  const prov = (provider || "").toLowerCase().trim();

  // Small local models: 1.5b, 2b, 3b, 4b, 7b, 8b, mini, small
  // Tested before frontier so distilled local reasoning variants (e.g. deepseek-r1:1.5b) stay compact
  if (
    /(^|[^0-9])(1\.5|2|3|4|7|8)b([^0-9]|$)/i.test(model) ||
    model.includes("mini") ||
    model.includes("small")
  ) {
    return "compact";
  }

  // Frontier providers & large models
  if (
    prov === "claude" ||
    prov === "openai" ||
    prov === "deepseek" ||
    (prov === "openrouter" && !model) ||
    model.includes("claude") ||
    model.includes("gpt-4") ||
    model.includes("gpt-5") ||
    model.includes("deepseek-chat") ||
    model.includes("deepseek-v3") ||
    model.includes("deepseek-reasoner") ||
    (model.includes("deepseek-r1") && !/(^|[^0-9])(14|32)b([^0-9]|$)/i.test(model)) ||
    /(^|[^0-9])(70|67|110|405|671)b([^0-9]|$)/i.test(model) ||
    model.includes("opus") ||
    model.includes("sonnet") ||
    model.includes("haiku")
  ) {
    return "frontier";
  }

  // Medium local/cloud models (14b, 32b, mistral, llama, etc.)
  return "standard";
}
