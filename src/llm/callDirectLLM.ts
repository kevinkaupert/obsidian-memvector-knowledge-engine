import { requestUrl } from "../obsidianCompat";
import { ANTHROPIC_DEFAULT_MODEL, PROVIDER_DEFAULT_MODELS } from "./modelDefaults";
import { buildChatCompletionsUrl, detectProvider } from "./providerRouting";

const DEFAULT_SYSTEM_PROMPT =
  "You are a knowledge synthesis assistant for Obsidian. Respond concisely, structured, and precisely.";

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface LlmChoice {
  message?: {
    content?: string;
    reasoning?: string;
  };
}

interface LlmResponseData {
  content?: AnthropicContentBlock[];
  choices?: LlmChoice[];
  message?: {
    content?: string;
  };
  response?: string;
}

interface LlmErrorResponse {
  error?: string | { message?: string };
  message?: string;
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
      const isReasoning = /(reasoner|r1|o1|o3)/i.test((modelName || "").trim());
      payload = {
        model: modelName || PROVIDER_DEFAULT_MODELS.ollama,
        messages: [
          ...(systemPrompt && systemPrompt.trim() ? [{ role: "system", content: systemPrompt.trim() }] : []),
          { role: "user", content: prompt || "Hallo" },
        ],
        stream: false,
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
      const data = response.json as LlmResponseData | null | undefined;
      if (provider === "anthropic") {
        const blocks: AnthropicContentBlock[] | undefined = data?.content;
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
      const ans =
        data?.choices?.[0]?.message?.content ||
        data?.choices?.[0]?.message?.reasoning ||
        data?.message?.content ||
        data?.response;
      if (ans && typeof ans === "string") return ans;
      return "Keine Antwort vom LLM erhalten.";
    }

    // Native Ollama /api/chat fallback if /v1/chat/completions failed
    if (url.includes("11434") || url.includes("localhost") || url.includes("127.0.0.1")) {
      const nativeUrl = url.replace(/\/v1\/chat\/completions$/, "/api/chat");
      if (nativeUrl !== url) {
        try {
          const nativeRes = await requestUrl({
            url: nativeUrl,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: payload.model,
              messages: payload.messages,
              stream: false,
            }),
            throwOnError: false,
          });
          if (nativeRes.status === 200) {
            const nData = nativeRes.json as LlmResponseData | null | undefined;
            const nAns = nData?.message?.content || nData?.response;
            if (nAns && typeof nAns === "string") return nAns;
          }
        } catch {
          // fallback failed, continue to standard error reporting
        }
      }
    }

    let errMsg = "";
    try {
      const errJson = response.json as LlmErrorResponse | null | undefined;
      if (typeof errJson?.error === "string") {
        errMsg = errJson.error;
      } else if (typeof errJson?.error === "object" && errJson?.error?.message) {
        errMsg = errJson.error.message;
      } else if (typeof errJson?.message === "string") {
        errMsg = errJson.message;
      }
    } catch {
      // not JSON
    }
    if (!errMsg) errMsg = response.text || `HTTP ${response.status}`;

    console.error("MemVector: LLM Request fehlgeschlagen. Status:", response.status, "URL:", url, "Details:", errMsg);

    if (response.status === 400) {
      throw new Error(`HTTP 400 Bad Request (${url}): ${errMsg}`);
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
