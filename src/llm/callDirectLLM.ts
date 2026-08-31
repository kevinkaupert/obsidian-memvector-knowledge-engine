import { requestUrl } from "../obsidianCompat";
import { ANTHROPIC_DEFAULT_MODEL, PROVIDER_DEFAULT_MODELS } from "./modelDefaults";
import { buildChatCompletionsUrl, detectProvider } from "./providerRouting";

const DEFAULT_SYSTEM_PROMPT =
  "You are a knowledge synthesis assistant for Obsidian. Respond concisely, structured, and precisely.";

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

export async function callDirectLLM(
  prompt: string,
  apiBase: string,
  apiKey: string,
  modelName: string,
  temperature = 0.1,
  systemPrompt = DEFAULT_SYSTEM_PROMPT,
  llmProvider = ""
): Promise<string> {
  try {
    const cleanKey = (apiKey || "").trim();
    const provider = detectProvider(apiBase, modelName, llmProvider);
    const url = buildChatCompletionsUrl(provider, apiBase);
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    let payload: Record<string, unknown>;

    if (provider === "anthropic") {
      let cleanModel = (modelName || ANTHROPIC_DEFAULT_MODEL).trim();
      if (cleanModel.toLowerCase().startsWith("anthropic/")) {
        cleanModel = cleanModel.slice("anthropic/".length).trim();
      }

      if (cleanKey) headers["x-api-key"] = cleanKey;
      headers["anthropic-version"] = "2023-06-01";
      headers["anthropic-dangerous-direct-browser-access"] = "true";
      payload = {
        model: cleanModel,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt || "Hallo" }],
      };
      if (systemPrompt && systemPrompt.trim()) {
        payload.system = systemPrompt.trim();
      }
    } else {
      if (cleanKey && cleanKey !== "ollama") {
        headers["Authorization"] = `Bearer ${cleanKey}`;
      }
      const isReasoning = /^(deepseek-reasoner|o1|o3)/i.test((modelName || "").trim());
      payload = {
        model: modelName || PROVIDER_DEFAULT_MODELS.ollama,
        messages: [
          ...(systemPrompt && systemPrompt.trim() ? [{ role: "system", content: systemPrompt.trim() }] : []),
          { role: "user", content: prompt || "Hallo" },
        ],
      };
      if (!isReasoning && typeof temperature === "number") {
        payload.temperature = Math.max(0, Math.min(2, temperature));
      }
    }

    const response = await requestUrl({
      url,
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      throwOnError: false,
    });

    if (response.status === 200) {
      const data = response.json;
      if (provider === "anthropic") {
        const blocks: AnthropicContentBlock[] | undefined = data.content;
        if (Array.isArray(blocks)) {
          const textBlocks = blocks
            .filter((b) => b.type === "text" || (b.text && b.type !== "thinking"))
            .map((b) => b.text)
            .filter(Boolean);
          if (textBlocks.length > 0) {
            return textBlocks.join("\n\n");
          }
        }
        return blocks?.[0]?.text || "Keine Antwort von Claude erhalten.";
      }
      return data.choices?.[0]?.message?.content || "Keine Antwort vom LLM erhalten.";
    }

    let errMsg = "";
    try {
      const errJson = response.json;
      if (typeof errJson?.error === "string") errMsg = errJson.error;
      else if (errJson?.error?.message) errMsg = errJson.error.message;
      else if (errJson?.message) errMsg = errJson.message;
    } catch {
      // not JSON
    }
    if (!errMsg) errMsg = response.text || `HTTP ${response.status}`;

    if (response.status === 400) {
      throw new Error(`HTTP 400 Bad Request: ${errMsg}`);
    } else if (response.status === 402) {
      throw new Error(
        `HTTP 402 Payment Required: ${errMsg || "Guthaben aufgebraucht. Bitte lade Guthaben auf oder schalte auf lokales Ollama um."}`
      );
    } else if (response.status === 401) {
      throw new Error(`HTTP 401 Unauthorized: Ungültiger API-Key für ${url}. ${errMsg}`);
    } else if (response.status === 404) {
      throw new Error(`HTTP 404 Not Found: Modell '${modelName}' existiert nicht auf ${url}. ${errMsg}`);
    } else {
      throw new Error(`HTTP ${response.status}: ${errMsg}`);
    }
  } catch (err) {
    throw new Error(`${err instanceof Error ? err.message : String(err)}`);
  }
}
