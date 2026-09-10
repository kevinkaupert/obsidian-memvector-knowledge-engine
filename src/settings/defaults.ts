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

  vectorSearchExclusions: "-path:schema -file:index -file:log -file:README -file:AGENTS -file:PROFILE -file:canvas-",
  radarNoteCount: 10,

  enrichSynthesisContext: true,
  includeAgentsGuidelines: false,
  agentsGuidelinePaths: "AGENTS.md, meta/PROFILE.md",
  relationVocabularyPath: "wiki/relation-types.json",
  scatterVisualStyle: "ink",
  unselectedLabelOpacity: 0.35,
  scatterNodeSpacing: 350,
  scatterCloudSpacing: 800,
};

