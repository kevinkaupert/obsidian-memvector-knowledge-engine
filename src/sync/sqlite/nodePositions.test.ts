import { readFileSync } from "fs";
import { resolve } from "path";
import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { closeLocalDb } from "./sqliteDb";
import { getStoredNodePositions, reconcileNodePositions, reconcileNodePositionsWithVault, saveNodePositions } from "./nodePositions";
import { pathToId } from "../../noteSlug";

function fakeApp(files: Map<string, ArrayBuffer> = new Map()): App {
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
        writeBinary: async (path: string, data: ArrayBuffer) => {
          files.set(path, data);
        },
      },
    },
  } as unknown as App;
}

describe("nodePositions SQLite persistence", () => {
  it("persists and retrieves coordinates by ID and path", async () => {
    const sharedFiles = new Map<string, ArrayBuffer>();
    const app = fakeApp(sharedFiles);

    await saveNodePositions(app, [
      { id: "note_1", path: "wiki/note_1.md", x: 120.5, y: -85.25 },
      { id: "note_2", path: "wiki/note_2.md", x: 340.0, y: 512.75 },
    ]);

    // Retrieve by ID
    const byId = await getStoredNodePositions(app, ["note_1"]);
    expect(byId.get("note_1")).toEqual({ x: 120.5, y: -85.25 });

    // Retrieve by path
    const byPath = await getStoredNodePositions(app, ["wiki/note_2.md"]);
    expect(byPath.get("wiki/note_2.md")).toEqual({ x: 340.0, y: 512.75 });

    // Retrieve unknown id
    const unknown = await getStoredNodePositions(app, ["non_existent"]);
    expect(unknown.has("non_existent")).toBe(false);
  });

  it("adversarial: ignores non-finite coordinates (NaN and Infinity) safely without crashing", async () => {
    const app = fakeApp();

    await saveNodePositions(app, [
      { id: "valid", x: 50, y: 60 },
      { id: "nan_x", x: NaN, y: 60 },
      { id: "inf_y", x: 50, y: Infinity },
      { id: "neg_inf", x: -Infinity, y: 60 },
    ]);

    const retrieved = await getStoredNodePositions(app, ["valid", "nan_x", "inf_y", "neg_inf"]);
    expect(retrieved.has("valid")).toBe(true);
    expect(retrieved.get("valid")).toEqual({ x: 50, y: 60 });
    expect(retrieved.has("nan_x")).toBe(false);
    expect(retrieved.has("inf_y")).toBe(false);
    expect(retrieved.has("neg_inf")).toBe(false);
  });

  it("updates existing positions on conflict", async () => {
    const app = fakeApp();

    await saveNodePositions(app, [{ id: "n1", path: "n1.md", x: 10, y: 20 }]);
    const first = await getStoredNodePositions(app, ["n1"]);
    expect(first.get("n1")).toEqual({ x: 10, y: 20 });

    await saveNodePositions(app, [{ id: "n1", path: "n1.md", x: 100, y: 200 }]);
    const second = await getStoredNodePositions(app, ["n1"]);
    expect(second.get("n1")).toEqual({ x: 100, y: 200 });
  });

  it("survives restart across a closed and reopened database connection", async () => {
    const sharedFiles = new Map<string, ArrayBuffer>();
    const app1 = fakeApp(sharedFiles);

    await saveNodePositions(app1, [{ id: "saved_note", x: 42, y: 84 }]);
    await closeLocalDb();

    // Reopen with fresh App instance sharing disk files
    const app2 = fakeApp(sharedFiles);
    const retrieved = await getStoredNodePositions(app2, ["saved_note"]);
    expect(retrieved.get("saved_note")).toEqual({ x: 42, y: 84 });
    await closeLocalDb();
  });

  it("reconciles and removes deleted note positions", async () => {
    const app = fakeApp();

    await saveNodePositions(app, [
      { id: "keep_1", x: 1, y: 1 },
      { id: "keep_2", x: 2, y: 2 },
      { id: "delete_me", x: 3, y: 3 },
    ]);

    const { removed } = await reconcileNodePositions(app, ["keep_1", "keep_2"]);
    expect(removed).toBe(1);

    const positions = await getStoredNodePositions(app, ["keep_1", "keep_2", "delete_me"]);
    expect(positions.has("keep_1")).toBe(true);
    expect(positions.has("keep_2")).toBe(true);
    expect(positions.has("delete_me")).toBe(false);
  });

  it("removes positions of deleted and excluded notes against the whole vault, keeping notes a view would hide (#196)", async () => {
    const app = fakeApp();
    const paths = ["wiki/kept.md", "wiki/relations/a--b.md", "archive/old.md"];
    (app.vault as unknown as { getMarkdownFiles: () => unknown[] }).getMarkdownFiles = () =>
      paths.map((path) => ({ path, name: path.slice(path.lastIndexOf("/") + 1), basename: path.slice(path.lastIndexOf("/") + 1, -3) }));
    await saveNodePositions(app, [
      ...paths.map((path, i) => ({ id: pathToId(path), path, x: i + 1, y: i + 1 })),
      { id: pathToId("wiki/deleted.md"), path: "wiki/deleted.md", x: 9, y: 9 },
    ]);

    const { removed } = await reconcileNodePositionsWithVault(app, "-path:archive");

    expect(removed).toBe(2);
    const left = await getStoredNodePositions(app, [...paths, "wiki/deleted.md"].map(pathToId));
    expect([...left.keys()].sort()).toEqual([pathToId("wiki/kept.md"), pathToId("wiki/relations/a--b.md")].sort());
    await closeLocalDb();
  });
});
