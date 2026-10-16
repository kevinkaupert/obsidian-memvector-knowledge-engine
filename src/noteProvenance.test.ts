import { describe, expect, it } from "vitest";
import { generatedBy } from "./noteProvenance";

describe("generatedBy (knowOS vault schema)", () => {
  it("formats component, provider and model", () => {
    expect(generatedBy("openai", "gpt-4o")).toBe("memvector/openai:gpt-4o");
    expect(generatedBy("ollama", "qwen2.5:7b")).toBe("memvector/ollama:qwen2.5:7b");
  });

  it("does not invent a provider or model", () => {
    expect(generatedBy(undefined, "gpt-4o")).toBe("memvector/gpt-4o");
    expect(generatedBy("  ", "")).toBe("memvector");
  });
});
