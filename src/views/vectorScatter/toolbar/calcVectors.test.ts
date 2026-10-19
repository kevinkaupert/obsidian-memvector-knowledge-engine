/**
 * Purpose: "Calculate vectors" embeds only the notes the view filter shows (Plan 0005 S2 review): filtered notes stay in
 * the layout but must not widen a paid embedding run.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({ Notice: class {} }));
vi.mock("../../../sync/vectorPipeline", () => ({
  EmbeddingAbortedError: class extends Error {},
  VectorPersistenceError: class extends Error {},
  runVectorPipeline: vi.fn(async () => ({ embedded: 0, skipped: 0, failed: [], vectors: new Map() })),
}));
vi.mock("../../../sync/storeFactory", () => ({ getVectorStore: vi.fn(() => ({})) }));
vi.mock("../../../sync/sqlite/nodePositions", () => ({ reconcileNodePositionsWithVault: vi.fn(async () => {}) }));
vi.mock("../../../sync/sqlite/noteKeyMigration", () => ({ migrateVaultNoteKeys: vi.fn(async () => 0) }));
vi.mock("../../../vaultFilter", () => ({ listIndexableFiles: vi.fn(() => [{ path: "a.md" }, { path: "b.md" }]) }));
vi.mock("./toolbarControls", () => ({ setActionBtnEnabled: vi.fn() }));
vi.mock("./hoverBar", () => ({ setHoverBarText: vi.fn() }));

import { runVectorPipeline } from "../../../sync/vectorPipeline";
import { runCalcVectors } from "./calcVectors";
import { DEFAULT_SETTINGS } from "../../../settings/defaults";

describe("runCalcVectors", () => {
  it("embeds the visible notes only, and reconciles against the whole vault", async () => {
    const a = { id: "a", path: "a.md", title: "a" };
    const b = { id: "b", path: "b.md", title: "b" };
    const ctx = {
      app: {},
      settings: { ...DEFAULT_SETTINGS },
      nodes: [a, b],
      getVisibleNodes: () => [a],
      scanVaultNotes: vi.fn(),
      applyLayout: vi.fn(),
      redraw: vi.fn(),
      onVectorsCalculated: vi.fn(async () => {}),
    };
    await runCalcVectors(ctx as never, {} as HTMLButtonElement, { setText: vi.fn() } as never, {} as HTMLElement);
    const options = vi.mocked(runVectorPipeline).mock.calls[0][3] as { paths: string[]; reconcilePaths: string[] };
    expect(options.paths).toEqual(["a.md"]);
    expect(options.reconcilePaths).toEqual(["a.md", "b.md"]);
  });
});
