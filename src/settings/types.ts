export type LlmProvider = "ollama" | "claude" | "deepseek" | "openai" | "openrouter";
export type KnowledgeDomain = "general" | "math";

/**
 * Per-provider API keys. Replaces the legacy single `deepseekApiKey` field
 * (see apiKeyMigration.ts) that used to be silently reused/reset across
 * every cloud provider.
 */
export type ApiKeyMap = Partial<Record<LlmProvider, string>>;

export interface MemVectorSettings {
  language: string;
  knowledgeDomain: KnowledgeDomain;

  embeddingProvider: LlmProvider;
  embeddingApiBaseUrl: string;
  embeddingApiKey: string;
  embeddingModel: string;

  llmProvider: LlmProvider;
  apiBaseUrl: string;
  /** @deprecated use `apiKeys` instead; kept only for one-release migration safety. */
  deepseekApiKey?: string;
  apiKeys: ApiKeyMap;
  modelName: string;
  temperature: number;

  vectorSearchExclusions: string;
  weightVector: number;
  weightWikiLinks: number;
  weightFolder: number;
  weightSemantics: number;
  radarNoteCount: number;
  synthesisLinkMode: string;
  cloudNamingMode: string;

  qdrantUrl: string;
  qdrantCollection: string;
  qdrantApiKey: string;
  autoSyncQdrant: boolean;

  memgraphUrl: string;
  memgraphUser: string;
  memgraphPassword: string;
  autoSyncMemgraph: boolean;

  fetchedLlmModels?: string[];
  fetchedEmbedModels?: string[];
}
