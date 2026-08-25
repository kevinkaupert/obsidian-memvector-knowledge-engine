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

  if (cleanBase.includes("11434")) {
    const rawOllamaBase = cleanBase.replace(/\/v1$/, "");
    try {
      const res = await requestUrl({
        url: `${rawOllamaBase}/api/embeddings`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelName, prompt: text.slice(0, 2000) }),
        throwOnError: false,
      });
      if (res.status === 200 && res.json?.embedding) {
        return { embedding: res.json.embedding, error: null };
      } else if (res.status === 404) {
        return {
          embedding: null,
          error: `Modell '${modelName}' nicht in Ollama gefunden. Bitte im Terminal ausführen: 'ollama pull ${modelName}'`,
        };
      }
    } catch {
      // fall through to the generic /v1/embeddings path below
    }
  }

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey && apiKey !== "ollama") {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    const res = await requestUrl({
      url: `${cleanBase}/embeddings`,
      method: "POST",
      headers,
      body: JSON.stringify({ model: modelName, input: text.slice(0, 2000) }),
      throwOnError: false,
    });
    if (res.status === 200) {
      const vec = res.json?.data?.[0]?.embedding || res.json?.embedding;
      if (vec) return { embedding: vec, error: null };
    }
    return { embedding: null, error: `API HTTP ${res.status}: ${res.text || "Embedding fehlgeschlagen"}` };
  } catch (err) {
    return {
      embedding: null,
      error: `Verbindungsfehler zu '${cleanBase}': ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
