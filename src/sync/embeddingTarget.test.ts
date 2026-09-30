import { describe, expect, it } from "vitest";
import { resolveEmbeddingTarget } from "./embeddingTarget";

const target = (embeddingModel: string, embeddingApiBaseUrl: string) => resolveEmbeddingTarget({ embeddingModel, embeddingApiBaseUrl });

describe("resolveEmbeddingTarget", () => {
  it("distinguishes models on the same endpoint", () => {
    expect(target("bge-m3", "http://localhost:11434/v1").fingerprint).not.toBe(target("nomic-embed-text", "http://localhost:11434/v1").fingerprint);
  });

  it("distinguishes endpoints serving a same-named model", () => {
    expect(target("bge-m3", "http://localhost:11434/v1").fingerprint).not.toBe(target("bge-m3", "http://gpu-box:11434/v1").fingerprint);
  });

  it("treats equivalent spellings of the endpoint as the same vector space", () => {
    const base = target("bge-m3", "http://localhost:11434/v1").fingerprint;
    expect(target("bge-m3", "http://localhost:11434/v1/").fingerprint).toBe(base);
    expect(target("bge-m3", "HTTP://LOCALHOST:11434/v1").fingerprint).toBe(base);
    expect(target("bge-m3", "http://localhost:11434/v1/embeddings").fingerprint).toBe(base);
    expect(target(" bge-m3 ", " http://localhost:11434/v1 ").fingerprint).toBe(base);
  });

  it("falls back to the default model and endpoint when unset", () => {
    const resolved = target("", "");
    expect(resolved.model).toBe("bge-m3");
    expect(resolved.apiBase).toBe("http://localhost:11434/v1");
    expect(resolved.fingerprint).toBe(target("bge-m3", "http://localhost:11434/v1").fingerprint);
  });
});
