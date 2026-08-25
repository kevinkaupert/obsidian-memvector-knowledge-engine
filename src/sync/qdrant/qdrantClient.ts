import { requestUrl } from "../../obsidianCompat";

export interface QdrantPoint {
  id: number;
  vector: number[];
  payload: { path: string; title: string; content: string };
}

function buildHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["api-key"] = apiKey;
  return headers;
}

export async function ensureCollection(baseUrl: string, collection: string, apiKey: string): Promise<void> {
  await requestUrl({
    url: `${baseUrl}/collections/${collection}`,
    method: "PUT",
    headers: buildHeaders(apiKey),
    body: JSON.stringify({ vectors: { size: 1024, distance: "Cosine" } }),
    throwOnError: false,
  });
}

export async function upsertPoints(baseUrl: string, collection: string, apiKey: string, points: QdrantPoint[]): Promise<void> {
  const res = await requestUrl({
    url: `${baseUrl}/collections/${collection}/points?wait=true`,
    method: "PUT",
    headers: buildHeaders(apiKey),
    body: JSON.stringify({ points }),
    throwOnError: false,
  });
  if (res.status !== 200) {
    throw new Error(`Qdrant Upsert Fehler: HTTP ${res.status}`);
  }
}
