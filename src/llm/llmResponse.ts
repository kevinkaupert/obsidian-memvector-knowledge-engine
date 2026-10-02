export interface LlmResponse {
  content: string;
  reasoning?: string;
}

/** Extract inline thinking without ever substituting it for the answer. */
export function normalizeLlmResponse(content: string, reasoning: string[] = []): LlmResponse {
  const parts = [...reasoning];
  // A truncated thinking block runs to EOF; none of its body may become answer text.
  const stripped = content.replace(/<think>([\s\S]*?)(?:<\/think>|$)/g, (_, thinking: string) => {
    parts.push(thinking);
    return "";
  });
  const answer = stripped === content ? content : stripped.trim();
  const combined = [...new Set(parts.map((part) => part.trim()).filter(Boolean))].join("\n\n");
  if (!answer.trim()) {
    throw new Error(combined ? "LLM returned reasoning without an answer." : "No response received from LLM.");
  }
  return combined ? { content: answer, reasoning: combined } : { content: answer };
}

/** The same collapsed reasoning callout is used for display and the saved note. */
export function formatLlmResponse(response: LlmResponse, thinkingTitle: string): string {
  if (!response.reasoning) return response.content;
  return `> [!note]- ${thinkingTitle}\n> ${response.reasoning.replace(/\r\n/g, "\n").replace(/\n/g, "\n> ")}\n\n${response.content}`;
}
