/** Deterministic 31-bit numeric ID for a Qdrant point, derived from a vault file path. */
export function pointIdForPath(path: string): number {
  let hash = 0;
  for (let i = 0; i < path.length; i++) {
    hash = (hash << 5) - hash + path.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
