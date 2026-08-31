export function getShortModelName(model: string | undefined | null): string {
  if (!model) return "KI";
  const clean = model.trim();
  const lower = clean.toLowerCase();
  if (lower.includes("claude")) return "Claude";
  if (lower.includes("deepseek")) return "DeepSeek";
  if (lower.includes("gpt-4o")) return "GPT-4o";
  if (lower.includes("gpt-4")) return "GPT-4";
  if (lower.includes("llama")) return "Llama";
  if (lower.includes("mistral")) return "Mistral";
  const parts = clean.split("/");
  const baseName = parts[parts.length - 1].split(":")[0];
  return baseName.length > 12 ? `${baseName.slice(0, 10)}…` : baseName;
}
