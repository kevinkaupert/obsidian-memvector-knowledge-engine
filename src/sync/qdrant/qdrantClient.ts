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
  const res = await requestUrl({
    url: `${baseUrl}/collections/${collection}`,
    method: "PUT",
    headers: buildHeaders(apiKey),
    body: JSON.stringify({ vectors: { size: 1024, distance: "Cosine" } }),
    throwOnError: false,
  });
  // 200 = created, 409 = "already exists" (Qdrant's create-collection PUT
  // isn't idempotent) - both mean the desired end state is reached. The
  // original code discarded this response entirely, silently swallowing
  // any *real* creation failure (bad request, auth, etc.) too.
  if (res.status !== 200 && res.status !== 409) {
    throw new Error(`Qdrant Collection-Fehler: HTTP ${res.status}: ${res.text || "Collection konnte nicht angelegt werden"}`);
  }
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

export interface QdrantSearchHit {
  score: number;
  payload: { path: string; title: string; content: string };
}

/** Vector similarity search - the read half of what was, until now, a write-only sync target. */
export async function searchSimilar(baseUrl: string, collection: string, apiKey: string, vector: number[], limit: number): Promise<QdrantSearchHit[]> {
  const res = await requestUrl({
    url: `${baseUrl}/collections/${collection}/points/search`,
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify({ vector, limit, with_payload: true }),
    throwOnError: false,
  });
  if (res.status !== 200) {
    throw new Error(`Qdrant Suche Fehler: HTTP ${res.status}: ${res.text || "Suche fehlgeschlagen"}`);
  }
  const result = res.json?.result;
  return Array.isArray(result) ? result : [];
}
