import { requestUrl } from "../../obsidianCompat";

/** Lightweight reachability check against Qdrant's root endpoint - the original never had one (only LLM and Memgraph did), added on request. */
export async function testQdrantConnection(baseUrl: string, apiKey: string): Promise<void> {
  const url = `${(baseUrl || "http://localhost:6333").replace(/\/+$/, "")}/`;
  const headers: Record<string, string> = {};
  if (apiKey) headers["api-key"] = apiKey;

  const res = await requestUrl({ url, method: "GET", headers, throwOnError: false });

  if (res.status === 200) return;
  if (res.status === 401 || res.status === 403) {
    throw new Error(`HTTP ${res.status} Unauthorized: Ungültiger API-Key für ${url}`);
  }
  throw new Error(`HTTP ${res.status}: ${res.text || "Qdrant nicht erreichbar"}`);
}
