import { requestUrl } from "../obsidianCompat";
import { requestEmbedding, type EmbeddingResult } from "./embeddingRequest";

export type { EmbeddingResult };

/**
 * Purpose: Fetches one embedding through Obsidian's requestUrl (no CORS limits in the app). The request itself lives in
 * embeddingRequest.ts, so the command-line tool (src/cli) sends exactly the same requests through Node's fetch.
 */
export function fetchEmbedding(
  text: string,
  apiBase: string,
  apiKey: string,
  modelName = "bge-m3"
): Promise<EmbeddingResult> {
  return requestEmbedding(
    async (req) => {
      const res = await requestUrl({ ...req, throwOnError: false });
      return { status: res.status, json: res.json as unknown };
    },
    text,
    apiBase,
    apiKey,
    modelName
  );
}
