export type ModelTier = "compact" | "standard" | "frontier";

export interface ContextBudget {
  tier: ModelTier;
  maxNeighborsPerSource: number;
  maxTotalEnriched: number;
  neighborExcerptLength: number;
  selectedNoteContentLength: number;
  guidelinesCharBudget: number;
  includeGraphTopology: boolean;
}

/**
 * Detects the capacity tier of the currently configured LLM.
 * - compact: 1.5B - 8B local models (strict token conservation)
 * - standard: 14B - 32B models (balanced context)
 * - frontier: Claude, GPT-4o, DeepSeek-V3, 70B+ models (deep GraphRAG context)
 */
export function detectModelTier(modelName: string | undefined, provider: string | undefined): ModelTier {
  const model = (modelName || "").toLowerCase().trim();
  const prov = (provider || "").toLowerCase().trim();

  // Frontier providers & large models
  if (
    prov === "claude" ||
    prov === "openai" ||
    model.includes("claude") ||
    model.includes("gpt-4") ||
    model.includes("deepseek-chat") ||
    model.includes("deepseek-v3") ||
    /(^|[^0-9])(70|67|110|405)b([^0-9]|$)/i.test(model) ||
    model.includes("opus") ||
    model.includes("sonnet") ||
    model.includes("haiku")
  ) {
    return "frontier";
  }

  // Small local models: 1.5b, 2b, 3b, 4b, 7b, 8b, mini, small
  if (
    /(^|[^0-9])(1\.5|2|3|4|7|8)b([^0-9]|$)/i.test(model) ||
    model.includes("mini") ||
    model.includes("small")
  ) {
    return "compact";
  }

  // Medium local/cloud models (14b, 32b, mistral, llama, etc.)
  return "standard";
}

export function getContextBudget(modelName: string | undefined, provider: string | undefined): ContextBudget {
  const tier = detectModelTier(modelName, provider);

  switch (tier) {
    case "frontier":
      return {
        tier: "frontier",
        maxNeighborsPerSource: 6,
        maxTotalEnriched: 10,
        neighborExcerptLength: 2000,
        selectedNoteContentLength: 4000,
        guidelinesCharBudget: 8000,
        includeGraphTopology: true,
      };
    case "standard":
      return {
        tier: "standard",
        maxNeighborsPerSource: 3,
        maxTotalEnriched: 5,
        neighborExcerptLength: 600,
        selectedNoteContentLength: 1200,
        guidelinesCharBudget: 1500,
        includeGraphTopology: true,
      };
    case "compact":
    default:
      return {
        tier: "compact",
        maxNeighborsPerSource: 2,
        maxTotalEnriched: 3,
        neighborExcerptLength: 200,
        selectedNoteContentLength: 400,
        guidelinesCharBudget: 500,
        includeGraphTopology: false,
      };
  }
}
