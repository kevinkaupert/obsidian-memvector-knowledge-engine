import { describe, it, expect } from "vitest";
import type { App } from "obsidian";
import { getGraphStore, getVectorStore } from "./storeFactory";
import { SqliteGraphStore } from "./sqlite/sqliteGraphStore";
import { SqliteVectorStore } from "./sqlite/sqliteVectorStore";

function fakeApp(): App {
  return {
    vault: {
      adapter: {
        exists: async () => false,
        readBinary: async () => new Uint8Array(),
        writeBinary: async () => {},
      },
    },
  } as unknown as App;
}

describe("storeFactory", () => {
  it("provides SqliteGraphStore instance", () => {
    const store = getGraphStore(fakeApp());
    expect(store).toBeInstanceOf(SqliteGraphStore);
  });

  it("provides SqliteVectorStore instance", () => {
    const store = getVectorStore(fakeApp());
    expect(store).toBeInstanceOf(SqliteVectorStore);
  });
});
