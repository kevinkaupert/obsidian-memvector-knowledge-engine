/**
 * Purpose: Formats `generated.by` for notes whose content an LLM produced, following the knowOS vault
 * schema: `memvector/<provider>:<model>`. Without a known provider it falls back to `memvector/<model>`
 * rather than inventing one, and to `memvector` when the model is unknown too.
 */
export function generatedBy(provider: string | undefined, model: string | undefined): string {
  const p = (provider ?? "").trim();
  const m = (model ?? "").trim();
  if (p && m) return `memvector/${p}:${m}`;
  if (m) return `memvector/${m}`;
  return "memvector";
}
