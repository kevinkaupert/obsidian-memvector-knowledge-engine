import { readFileSync } from "fs";
import { resolve } from "path";
import type { App } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { localDbPath, persistLocalDb, pluginDirPath, setPluginDir, setPluginId } from "./sqliteDb";
import { SqliteVectorStore } from "./sqliteVectorStore";
import type { Database } from "sql.js";

/** Same fake app.vault.adapter pattern as sqliteVectorStore.test.ts, with a controllable writeBinary so persistence failures can be injected. */
function fakeAppWithFiles(files: Map<string, ArrayBuffer>, writeBinary: (path: string, data: ArrayBuffer) => Promise<void>): App {
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
    const app = fakeAppWithFiles(files, async () => {
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
    const app = fakeAppWithFiles(files, async (path, data) => {
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

describe("sqliteDb path resolution", () => {
  const fakeApp = {
    vault: {
      configDir: ".obsidian",
      adapter: {
        exists: vi.fn(),
        mkdir: vi.fn(),
        writeBinary: vi.fn(),
      },
    },
  } as unknown as App;

  beforeEach(() => {
    setPluginDir("");
    setPluginId("memvector-knowledge-engine");
    vi.clearAllMocks();
  });

  it("defaults to configDir/plugins/pluginId when activePluginDir is not set", () => {
    expect(pluginDirPath(fakeApp)).toBe(".obsidian/plugins/memvector-knowledge-engine");
    expect(localDbPath(fakeApp)).toBe(".obsidian/plugins/memvector-knowledge-engine/memvector-local.sqlite");
  });

  it("uses manifest.dir when setPluginDir is configured", () => {
    setPluginDir(".obsidian/plugins/obsidian-memvector-knowledge-engine");
    expect(pluginDirPath(fakeApp)).toBe(".obsidian/plugins/obsidian-memvector-knowledge-engine");
    expect(localDbPath(fakeApp)).toBe(".obsidian/plugins/obsidian-memvector-knowledge-engine/memvector-local.sqlite");
  });

  it("creates parent directory if it does not exist before persisting", async () => {
    setPluginDir(".obsidian/plugins/obsidian-memvector-knowledge-engine");
    const existsMock = vi.mocked(fakeApp.vault.adapter.exists).mockResolvedValue(false);
    const mkdirMock = vi.mocked(fakeApp.vault.adapter.mkdir).mockResolvedValue(undefined);
    const writeBinaryMock = vi.mocked(fakeApp.vault.adapter.writeBinary).mockResolvedValue(undefined);

    const fakeDb = {
      export: () => new Uint8Array([1, 2, 3]),
    } as unknown as Database;

    await persistLocalDb(fakeApp, fakeDb);

    expect(existsMock).toHaveBeenCalledWith(".obsidian/plugins/obsidian-memvector-knowledge-engine");
    expect(mkdirMock).toHaveBeenCalledWith(".obsidian/plugins/obsidian-memvector-knowledge-engine");
    expect(writeBinaryMock).toHaveBeenCalledWith(
      ".obsidian/plugins/obsidian-memvector-knowledge-engine/memvector-local.sqlite",
      expect.any(ArrayBuffer)
    );
  });
});
