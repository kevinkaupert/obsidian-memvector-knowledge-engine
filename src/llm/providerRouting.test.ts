import { describe, expect, it } from "vitest";
import { buildChatCompletionsUrl, buildModelsUrl, detectProvider } from "./providerRouting";

describe("detectProvider", () => {
  it("detects Anthropic by base URL", () => {
    expect(detectProvider("https://api.anthropic.com/v1", "some-model")).toBe("anthropic");
  });

  it("detects Anthropic by model name containing 'claude' or 'sonnet'", () => {
    expect(detectProvider("http://localhost:11434/v1", "claude-sonnet-5")).toBe("anthropic");
    expect(detectProvider("http://localhost:11434/v1", "anthropic/claude-sonnet-5")).toBe("anthropic");
  });

  it("detects Anthropic by an explicit llmProvider hint even without base-URL/model clues", () => {
    expect(detectProvider("http://localhost:8080/v1", "custom-model", "claude")).toBe("anthropic");
  });

  it("detects deepseek/openai/openrouter by base URL", () => {
    expect(detectProvider("https://api.deepseek.com/v1", "")).toBe("deepseek");
    expect(detectProvider("https://api.openai.com/v1", "")).toBe("openai");
    expect(detectProvider("https://openrouter.ai/api/v1", "")).toBe("openrouter");
  });

  it("falls back to generic for anything else (e.g. Ollama)", () => {
    expect(detectProvider("http://localhost:11434/v1", "deepseek-r1:7b")).toBe("generic");
  });
});

describe("buildChatCompletionsUrl", () => {
  it("returns fixed endpoints for known cloud providers", () => {
    expect(buildChatCompletionsUrl("anthropic", "")).toBe("https://api.anthropic.com/v1/messages");
    expect(buildChatCompletionsUrl("deepseek", "")).toBe("https://api.deepseek.com/v1/chat/completions");
    expect(buildChatCompletionsUrl("openai", "")).toBe("https://api.openai.com/v1/chat/completions");
    expect(buildChatCompletionsUrl("openrouter", "")).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  it("appends /chat/completions to a generic base URL, stripping trailing slashes and known suffixes", () => {
    expect(buildChatCompletionsUrl("generic", "http://localhost:11434/v1")).toBe("http://localhost:11434/v1/chat/completions");
    expect(buildChatCompletionsUrl("generic", "http://localhost:11434/v1/")).toBe("http://localhost:11434/v1/chat/completions");
    expect(buildChatCompletionsUrl("generic", "http://localhost:11434/v1/chat/completions")).toBe("http://localhost:11434/v1/chat/completions");
  });

  it("defaults to the local Ollama URL when no base URL is given", () => {
    expect(buildChatCompletionsUrl("generic", "")).toBe("http://localhost:11434/v1/chat/completions");
  });
});

describe("buildModelsUrl", () => {
  it("returns the Anthropic models endpoint regardless of base URL", () => {
    expect(buildModelsUrl("anthropic", "https://api.anthropic.com/v1")).toBe("https://api.anthropic.com/v1/models");
  });

  it("appends /models to a generic base URL without duplicating it", () => {
    expect(buildModelsUrl("generic", "http://localhost:11434/v1")).toBe("http://localhost:11434/v1/models");
    expect(buildModelsUrl("generic", "http://localhost:11434/v1/models")).toBe("http://localhost:11434/v1/models");
  });
});
