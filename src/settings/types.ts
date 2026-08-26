export type LlmProvider = "ollama" | "claude" | "deepseek" | "openai" | "openrouter" | "custom";
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

  /** Relations created while Memgraph was unreachable - retried on next successful connection. */
  pendingMemgraphRelations: PendingMemgraphRelation[];
}

export interface RelationGraphNode {
  id: string;
  title: string;
  path: string;
  type: string;
}

export interface PendingMemgraphRelation {
  src: RelationGraphNode;
  tgt: RelationGraphNode;
  relType: string;
  description: string;
  queuedAt: string;
}

/**
 * Minimal shape settings-tab sections need from the plugin instance.
 * Kept separate from the concrete plugin class to avoid settings/* importing
 * back up from main.ts.
 */
export interface SettingsHost {
  settings: MemVectorSettings;
  saveSettings(): Promise<void>;
}
