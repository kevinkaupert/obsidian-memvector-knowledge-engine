import { beforeEach, describe, expect, it, vi } from "vitest";
import { callDirectLLM } from "./callDirectLLM";
import { requestUrl } from "../obsidianCompat";
import { formatLlmResponse } from "./llmResponse";

vi.mock("../obsidianCompat", () => ({ requestUrl: vi.fn() }));

function respond(json: unknown, status = 200) {
  vi.mocked(requestUrl).mockResolvedValueOnce({ status, json, text: "unavailable" } as Awaited<ReturnType<typeof requestUrl>>);
}

beforeEach(() => vi.resetAllMocks());

describe("provider reasoning (#181)", () => {
  it.each([
    ["OpenAI-compatible", { choices: [{ message: { content: "Answer", reasoning: "Reasoning" } }] }, "custom"],
    ["DeepSeek", { choices: [{ message: { content: "Answer", reasoning_content: "Reasoning" } }] }, "deepseek"],
    ["inline thinking", { choices: [{ message: { content: "<think>Reasoning</think>\nAnswer" } }] }, "ollama"],
    ["Anthropic", { content: [{ type: "thinking", thinking: "Reasoning" }, { type: "text", text: "Answer" }] }, "anthropic"],
  ])("keeps answer and reasoning from %s", async (_, data, provider) => {
    respond(data);
    const result = await callDirectLLM("prompt", provider === "anthropic" ? "https://api.anthropic.com/v1" : "https://example.com/v1", "key", "model", 0.1, "system", provider);
    expect(result).toEqual({ content: "Answer", reasoning: "Reasoning" });
    expect(formatLlmResponse(result, "Model reasoning")).toBe("> [!note]- Model reasoning\n> Reasoning\n\nAnswer");
  });

  it("collects native Ollama thinking after the compatibility endpoint fails", async () => {
    respond({}, 404);
    respond({ message: { content: "Answer", thinking: "Line 1\nLine 2" } });
    const result = await callDirectLLM("prompt", "http://localhost:11434/v1", "", "model");
    expect(vi.mocked(requestUrl).mock.calls[1][0].url).toBe("http://localhost:11434/api/chat");
    expect(formatLlmResponse(result, "Reasoning")).toBe("> [!note]- Reasoning\n> Line 1\n> Line 2\n\nAnswer");
  });

  it.each([
    [{ choices: [{ message: { reasoning: "Hidden thought" } }] }, "custom"],
    [{ choices: [{ message: { reasoning_content: "Hidden thought" } }] }, "deepseek"],
    [{ choices: [{ message: { content: "<think>Hidden thought</think>" } }] }, "ollama"],
    [{ content: [{ type: "thinking", thinking: "Hidden thought" }] }, "anthropic"],
    [{ message: { thinking: "Hidden thought" } }, "ollama"],
  ])("rejects reasoning without answer: %j", async (data, provider) => {
    respond(data);
    await expect(callDirectLLM("prompt", provider === "anthropic" ? "https://api.anthropic.com/v1" : "https://example.com/v1", "", "model", 0.1, "system", provider))
      .rejects.toThrow("reasoning without an answer");
  });

  it("preserves an answer without reasoning unchanged", async () => {
    respond({ choices: [{ message: { content: " Answer\n" } }] });
    const result = await callDirectLLM("prompt", "https://example.com/v1", "", "model");
    expect(result).toEqual({ content: " Answer\n" });
    expect(formatLlmResponse(result, "Reasoning")).toBe(" Answer\n");
  });

  it("keeps separate and inline reasoning together", async () => {
    respond({ choices: [{ message: { content: "<think>Inline</think>Answer", reasoning: "Separate" } }] });
    expect(await callDirectLLM("prompt", "https://example.com/v1", "", "model"))
      .toEqual({ content: "Answer", reasoning: "Separate\n\nInline" });
  });

  it("rejects a truncated thinking-only response instead of displaying reasoning as the answer", async () => {
    respond({ choices: [{ message: { content: "<think>Incomplete reasoning" } }] });
    await expect(callDirectLLM("prompt", "https://example.com/v1", "", "model"))
      .rejects.toThrow("reasoning without an answer");
  });

  it("keeps answer text before a truncated thinking block and moves the remainder to reasoning", async () => {
    respond({ choices: [{ message: { content: "Answer\n<think>Incomplete reasoning" } }] });
    expect(await callDirectLLM("prompt", "https://example.com/v1", "", "model"))
      .toEqual({ content: "Answer", reasoning: "Incomplete reasoning" });
  });
});
