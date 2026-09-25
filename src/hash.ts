/**
 * Purpose: Computes a deterministic 32-bit integer hash for a string (DJB2/Java-style).
 */
export function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
