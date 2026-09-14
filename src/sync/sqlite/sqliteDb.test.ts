import { readFileSync } from "fs";
import { resolve } from "path";
import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { SqliteVectorStore } from "./sqliteVectorStore";

/** Same fake app.vault.adapter pattern as sqliteVectorStore.test.ts, with a controllable writeBinary so persistence failures can be injected. */
function fakeApp(files: Map<string, ArrayBuffer>, writeBinary: (path: string, data: ArrayBuffer) => Promise<void>): App {
  const configDir = ".obsidian";
  const wasmPath = `${configDir}/plugins/memvector-knowledge-engine/sql-wasm.wasm`;
  if (!files.has(wasmPath)) {
    const wasmBytes = readFileSync(resolve(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm"));
    files.set(wasmPath, wasmBytes.buffer.slice(wasmBytes.byteOffset, wasmBytes.byteOffset + wasmBytes.byteLength));
  }

  return {
    vault: {
      configDir,
      adapter: {
        exists: async (path: string) => files.has(path),
        readBinary: async (path: string) => {
          const buf = files.get(path);
          if (!buf) throw new Error(`fakeApp: no such file ${path}`);
          return buf;
        },
        writeBinary,
      },
    },
  } as unknown as App;
}

describe("persistLocalDb", () => {
  it("rejects the caller and leaves no persisted file when the adapter write fails", async () => {
    const files = new Map<string, ArrayBuffer>();
    const app = fakeApp(files, async () => {
      throw new Error("synthetic disk full");
    });
    const store = new SqliteVectorStore(app);

    await expect(store.syncPoints([{ id: "a", vector: [1, 0], payload: { path: "a.md", title: "a", content: "a" } }])).rejects.toThrow(
      "synthetic disk full"
    );
    expect(files.has(`${app.vault.configDir}/plugins/memvector-knowledge-engine/memvector-local.sqlite`)).toBe(false);
  });

  it("does not block a later write after a prior write failed", async () => {
    const files = new Map<string, ArrayBuffer>();
    let attempt = 0;
    const app = fakeApp(files, async (path, data) => {
      attempt++;
      if (attempt === 1) throw new Error("synthetic disk full");
      files.set(path, data);
    });
    const store = new SqliteVectorStore(app);

    await expect(store.syncPoints([{ id: "a", vector: [1, 0], payload: { path: "a.md", title: "a", content: "a" } }])).rejects.toThrow();
    await expect(store.syncPoints([{ id: "b", vector: [0, 1], payload: { path: "b.md", title: "b", content: "b" } }])).resolves.toBeUndefined();

    expect(files.has(`${app.vault.configDir}/plugins/memvector-knowledge-engine/memvector-local.sqlite`)).toBe(true);
  });
});
