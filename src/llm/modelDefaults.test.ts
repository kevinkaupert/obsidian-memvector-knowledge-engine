import { describe, expect, it } from "vitest";
import { ANTHROPIC_FALLBACK_MODELS, getDefaultModelFor, PROVIDER_DEFAULT_MODELS } from "./modelDefaults";

// Regression guard for bug #2: main.js hardcoded stale/fabricated model IDs
// ("claude-opus-5", "claude-sonnet-4-6" never existed) in 4+ scattered
// places. This is the single source of truth now - if a fabricated or
// clearly-outdated ID sneaks back in here, every call site inherits it.
const KNOWN_REAL_ANTHROPIC_MODELS = new Set([
  "claude-fable-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-sonnet-5",
  "claude-haiku-4-5-20251001",
]);

describe("ANTHROPIC_FALLBACK_MODELS", () => {
  it("contains only known-real model IDs", () => {
    for (const model of ANTHROPIC_FALLBACK_MODELS) {
      expect(KNOWN_REAL_ANTHROPIC_MODELS.has(model)).toBe(true);
    }
  });

  it("is non-empty", () => {
    expect(ANTHROPIC_FALLBACK_MODELS.length).toBeGreaterThan(0);
  });
});

describe("getDefaultModelFor", () => {
  it("returns a distinct default per provider", () => {
    expect(getDefaultModelFor("claude")).toBe("claude-sonnet-5");
    expect(getDefaultModelFor("deepseek")).toBe("deepseek-reasoner");
    expect(getDefaultModelFor("openai")).toBe("gpt-4o");
    expect(getDefaultModelFor("ollama")).toBe("deepseek-r1:7b");
  });

  it("openrouter's default targets a real, current Claude model (was stale claude-3.5-sonnet)", () => {
    expect(PROVIDER_DEFAULT_MODELS.openrouter).toContain("claude-sonnet-5");
  });
});
