export interface EmbeddingResult {
  embedding: number[] | null;
  error: string | null;
}

interface OpenAiEmbeddingResponse {
  data?: Array<{ embedding?: number[] }>;
  embedding?: number[];
}

interface OllamaEmbedResponse {
  embeddings?: number[][];
}

/** One POST as the embedding call needs it; `json` is the parsed body or undefined. Never throws for an HTTP status. */
export type EmbeddingPost = (req: { url: string; method: "POST"; headers: Record<string, string>; body: string }) =>
  Promise<{ status: number; json: unknown }>;

/**
 * Purpose: The embedding request without a platform dependency: the OpenAI-compatible /embeddings endpoint, then
 * Ollama's native /api/embed for a local server. `post` sends the request (Obsidian's request function in the plugin,
 * Node's fetch in the command-line tool).
 */
export async function requestEmbedding(
  post: EmbeddingPost,
  text: string,
  apiBase: string,
  apiKey: string,
  modelName = "bge-m3"
): Promise<EmbeddingResult> {
  const cleanBase = (apiBase || "http://localhost:11434/v1").replace(/\/+$/, "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey && apiKey !== "ollama") {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  // 1. Standard OpenAI-compatible /v1/embeddings endpoint
  const standardUrl = cleanBase.endsWith("/embeddings") ? cleanBase : `${cleanBase}/embeddings`;
  try {
    const res = await post({
      url: standardUrl,
      method: "POST",
      headers,
      body: JSON.stringify({ model: modelName, input: text }),
    });
    if (res.status === 200) {
      const data = res.json as OpenAiEmbeddingResponse | undefined;
      const vec = data?.data?.[0]?.embedding ?? data?.embedding;
      if (Array.isArray(vec) && vec.length > 0) return { embedding: vec, error: null };
    }
  } catch {
    // fallback to Ollama native /api/embed if running locally
  }

  // 2. Ollama native fallback
  if (cleanBase.includes("11434") || cleanBase.includes("localhost") || cleanBase.includes("127.0.0.1")) {
    const rawOllamaBase = cleanBase.replace(/\/v1$/, "");
    try {
      const res = await post({
        url: `${rawOllamaBase}/api/embed`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelName, input: text }),
      });
      const data = res.json as OllamaEmbedResponse | undefined;
      if (res.status === 200 && Array.isArray(data?.embeddings?.[0])) {
        return { embedding: data.embeddings[0], error: null };
      }
    } catch {
      // fallback
    }
  }

  return {
    embedding: null,
    error: `Embedding failed for model '${modelName}' at '${cleanBase}'`,
  };
}
