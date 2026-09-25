import type { MemVectorSettings } from "./types";
import { PROVIDER_DEFAULT_MODELS } from "../llm/modelDefaults";

export const DEFAULT_SETTINGS: MemVectorSettings = {
  language: "de",
  knowledgeDomain: "general",

  embeddingProvider: "ollama",
  embeddingApiBaseUrl: "http://localhost:11434/v1",
  embeddingModel: "bge-m3",

  llmProvider: "ollama",
  apiBaseUrl: "http://localhost:11434/v1",
  modelName: PROVIDER_DEFAULT_MODELS.ollama,
  temperature: 0.1,

  vectorSearchExclusions: "",
  radarNoteCount: 10,
  includeWikiLinksAsRelations: false,

  enrichSynthesisContext: true,
  synthesisHopDepth: 2,
  includeAgentsGuidelines: false,
  agentsGuidelinePaths: "AGENTS.md",
  relationVocabularyPath: "wiki/relation-types.json",
  synthesisContentCapChars: 0,
  scatterVisualStyle: "ink",
  unselectedLabelOpacity: 0.35,
  scatterNodeSpacing: 350,
  scatterCloudSpacing: 800,
};

