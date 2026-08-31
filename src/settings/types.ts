export type LlmProvider = "ollama" | "claude" | "deepseek" | "openai" | "openrouter" | "custom";
export type KnowledgeDomain = "general" | "math";
/** Vector-graph rendering theme: "monochrome" (neutral dots, color only on selection), "muted" (desaturated per-type colors + one soft glow per cluster), "ink" (outline-only dots, cluster glow only for the cluster containing the current selection/hover). */
export type ScatterVisualStyle = "monochrome" | "muted" | "ink";

/**
 * Per-provider API keys, keyed the same way settings/secrets.ts's secretStorage
 * IDs are derived. Only used as an in-memory shape during one-time migration
 * out of the legacy plaintext `apiKeys` settings field - actual keys now live
 * in Obsidian's app.secretStorage (since 1.11.4), never in data.json.
 */
export type ApiKeyMap = Partial<Record<LlmProvider, string>>;

export interface MemVectorSettings {
  language: string;
  knowledgeDomain: KnowledgeDomain;

  embeddingProvider: LlmProvider;
  embeddingApiBaseUrl: string;
  embeddingModel: string;

  llmProvider: LlmProvider;
  apiBaseUrl: string;
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

  /** "sqlite" needs no external server - graph/vectors live in a local file under the plugin folder instead of Memgraph/Qdrant. */
  graphBackend: "memgraph" | "sqlite";
  vectorBackend: "qdrant" | "sqlite";

  qdrantUrl: string;
  qdrantCollection: string;
  autoSyncQdrant: boolean;

  memgraphUrl: string;
  memgraphUser: string;
  autoSyncGraph: boolean;

  /** Hybrid GraphRAG: pull Qdrant-similar + Memgraph-neighbor notes into the LLM synthesis prompt as extra context. */
  enrichSynthesisContext: boolean;

  /** Include the vault's own AGENTS.md / meta/PROFILE.md (if present) as house-style guidance in the synthesis prompt. */
  includeAgentsGuidelines: boolean;
  /** Comma-separated vault paths to load for includeAgentsGuidelines - defaults to AGENTS.md, meta/PROFILE.md. */
  agentsGuidelinePaths: string;

  /** Vault path to the relation-type vocabulary file (relationVocabulary/loadRelationVocabulary.ts). Auto-created with a bundled STEM preset on first use - fully editable/replaceable for any other domain. */
  relationVocabularyPath: string;

  fetchedLlmModels?: string[];
  fetchedEmbedModels?: string[];

  /** Relations created while Memgraph was unreachable - retried on next successful connection. */
  pendingMemgraphRelations: PendingMemgraphRelation[];

  scatterVisualStyle: ScatterVisualStyle;
  /** Opacity (0-1) for the title label of any note that is neither selected/hovered nor connected to it - keeps a dense graph's labels from being visually overwhelming while a focus is active. */
  unselectedLabelOpacity: number;
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
  bidirectional?: boolean;
  originalTerm?: string;
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
