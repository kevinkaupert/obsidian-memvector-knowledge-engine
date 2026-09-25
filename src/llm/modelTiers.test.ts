import { describe, expect, it } from "vitest";
import { detectModelTier } from "./modelTiers";

describe("modelTiers", () => {
  describe("detectModelTier", () => {
    it("detects compact tier for small models", () => {
      expect(detectModelTier("deepseek-r1:1.5b", "ollama")).toBe("compact");
      expect(detectModelTier("llama-3.2:3b", "ollama")).toBe("compact");
      expect(detectModelTier("qwen2.5:7b", "ollama")).toBe("compact");
      expect(detectModelTier("phi3:mini", "ollama")).toBe("compact");
    });

    it("detects standard tier for medium models", () => {
      expect(detectModelTier("qwen2.5:14b", "ollama")).toBe("standard");
      expect(detectModelTier("deepseek-r1:32b", "ollama")).toBe("standard");
      expect(detectModelTier("mistral:latest", "ollama")).toBe("standard");
    });

    it("detects frontier tier for large and cloud models", () => {
      expect(detectModelTier("claude-sonnet-5", "claude")).toBe("frontier");
      expect(detectModelTier("gpt-4o", "openai")).toBe("frontier");
      expect(detectModelTier("deepseek-chat", "deepseek")).toBe("frontier");
      expect(detectModelTier("deepseek-reasoner", "deepseek")).toBe("frontier");
      expect(detectModelTier("", "openrouter")).toBe("frontier");
      expect(detectModelTier("anthropic/claude-3.5-sonnet", "openrouter")).toBe("frontier");
      expect(detectModelTier("deepseek/deepseek-r1", "openrouter")).toBe("frontier");
      expect(detectModelTier("llama3.3:70b", "ollama")).toBe("frontier");
    });
  });
});
