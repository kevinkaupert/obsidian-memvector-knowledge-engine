import type { MemVectorSettings } from "./types";
import { PROVIDER_DEFAULT_MODELS } from "../llm/modelDefaults";
import { DEFAULT_PRESETS_FOLDER, DEFAULT_RELATION_VOCABULARY_PATH, DEFAULT_RELATIONS_FOLDER, DEFAULT_SYNTHESIS_FOLDER } from "../vaultLayout";

export const DEFAULT_SETTINGS: MemVectorSettings = {
  language: "de",
  knowledgeDomain: "general",

  embeddingProvider: "ollama",
  embeddingApiBaseUrl: "http://localhost:11434/v1",
  embeddingModel: "bge-m3",
  embeddingMaxChars: 8000,

  llmProvider: "ollama",
  apiBaseUrl: "http://localhost:11434/v1",
  modelName: PROVIDER_DEFAULT_MODELS.ollama,
  temperature: 0.1,

  vectorSearchExclusions: "",
  radarNoteCount: 10,
  includeWikiLinksAsRelations: false,

  enrichSynthesisContext: true,
  synthesisHopDepth: 2,
  hopLevelNeighborLimit: 2,
  vectorNeighborLimit: 2,
  minVectorSimilarity: 0.75,
  totalContextLimit: 0,
  agentsGuidelinesCharCap: 0,
  includeAgentsGuidelines: false,
  agentsGuidelinePaths: "AGENTS.md",
  relationVocabularyPath: DEFAULT_RELATION_VOCABULARY_PATH,
  relationsFolder: DEFAULT_RELATIONS_FOLDER,
  synthesisFolder: DEFAULT_SYNTHESIS_FOLDER,
  presetsFolder: DEFAULT_PRESETS_FOLDER,
  synthesisContentCapChars: 0,
  scatterVisualStyle: "ink",
  showRelationNotes: false,
  unselectedLabelOpacity: 0.35,
  scatterNodeSpacing: 350,
  scatterCloudSpacing: 800,
};

