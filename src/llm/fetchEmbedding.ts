import { requestUrl } from "../obsidianCompat";

export interface EmbeddingResult {
  embedding: number[] | null;
  error: string | null;
}

export async function fetchEmbedding(
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
    const res = await requestUrl({
      url: standardUrl,
      method: "POST",
      headers,
      body: JSON.stringify({ model: modelName, input: text.slice(0, 2000) }),
      throwOnError: false,
    });
    if (res.status === 200) {
      const vec = res.json?.data?.[0]?.embedding || res.json?.embedding;
      if (Array.isArray(vec) && vec.length > 0) return { embedding: vec, error: null };
    }
  } catch {
    // fallback to Ollama native /api/embed if running locally
  }

  // 2. Ollama native fallback
  if (cleanBase.includes("11434") || cleanBase.includes("localhost") || cleanBase.includes("127.0.0.1")) {
    const rawOllamaBase = cleanBase.replace(/\/v1$/, "");
    try {
      const res = await requestUrl({
        url: `${rawOllamaBase}/api/embed`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelName, input: text.slice(0, 2000) }),
        throwOnError: false,
      });
      if (res.status === 200 && Array.isArray(res.json?.embeddings?.[0])) {
        return { embedding: res.json.embeddings[0], error: null };
      }
    } catch {
      // fallback
    }
  }

  return {
    embedding: null,
    error: `Embedding fehlgeschlagen für Modell '${modelName}' an '${cleanBase}'`,
  };
}
