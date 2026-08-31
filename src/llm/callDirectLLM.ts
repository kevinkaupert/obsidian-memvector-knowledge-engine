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
  systemPrompt = DEFAULT_SYSTEM_PROMPT
): Promise<string> {
  try {
    const cleanKey = (apiKey || "").trim();
    const provider = detectProvider(apiBase, modelName);
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
      payload = {
        model: modelName || PROVIDER_DEFAULT_MODELS.ollama,
        messages: [
          ...(systemPrompt && systemPrompt.trim() ? [{ role: "system", content: systemPrompt.trim() }] : []),
          { role: "user", content: prompt || "Hallo" },
        ],
        temperature: temperature ?? 0.1,
      };
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

    let errMsg = response.text;
    try {
      const errJson = response.json;
      if (errJson?.error?.message) errMsg = errJson.error.message;
    } catch {
      // response body wasn't JSON; keep the raw text as errMsg
    }

    if (response.status === 400) {
      throw new Error(`HTTP 400 Bad Request: ${errMsg || "Ungültige Parameter oder ungültiger Modellname für Claude"}`);
    } else if (response.status === 402) {
      throw new Error(
        `HTTP 402 Payment Required (Guthaben aufgebraucht): ${errMsg || "Bitte lade Guthaben auf platform.deepseek.com auf oder schalte auf lokales Ollama um."}`
      );
    } else if (response.status === 401) {
      throw new Error(`HTTP 401 Unauthorized: Ungültiger API-Key für ${url}`);
    } else if (response.status === 404) {
      throw new Error(`HTTP 404 Not Found: Modell '${modelName}' existiert nicht auf ${url}`);
    } else {
      throw new Error(`HTTP ${response.status}: ${errMsg || "LLM-Anfrage fehlgeschlagen"}`);
    }
  } catch (err) {
    // Re-throw rather than returning this as if it were the LLM's answer - callDirectLLM used to
    // swallow every failure (network-level *and* the HTTP-status errors thrown above) into a plain
    // string, so a down Ollama server produced a "successful" synthesis whose content was just the
    // error message. synthesis.ts's own try/catch already exists specifically to handle a real throw.
    throw new Error(`LLM Verbindungsfehler zu '${apiBase}': ${err instanceof Error ? err.message : String(err)}`);
  }
}
