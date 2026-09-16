import { describe, expect, it, vi, beforeEach } from "vitest";
import { runCalcVectors } from "./toolbar";
import type { ScatterViewContext } from "../context";
import { fetchEmbedding } from "../../../llm/fetchEmbedding";
import { getVectorStore } from "../../../sync/storeFactory";

const noticeCalls: { message: string; duration?: number }[] = [];

vi.mock("obsidian", () => {
  return {
    Notice: class {
      constructor(message: string, duration?: number) {
        noticeCalls.push({ message, duration });
      }
    },
  };
});

vi.mock("../../../llm/fetchEmbedding", () => ({
  fetchEmbedding: vi.fn(),
}));

vi.mock("../../../sync/storeFactory", () => ({
  getVectorStore: vi.fn(),
}));

vi.mock("../../../settings/secrets", () => ({
  resolveEmbeddingApiKey: vi.fn(() => "test-api-key"),
}));

interface MockEl {
  text: string;
  classes: Set<string>;
  disabled?: boolean;
  setText(t: string): void;
  addClass(c: string): void;
  removeClass(...c: string[]): void;
}

function createMockEl(): MockEl {
  const el: MockEl = {
    text: "",
    classes: new Set<string>(),
    setText(t: string) {
      this.text = t;
    },
    addClass(c: string) {
      this.classes.add(c);
    },
    removeClass(...classes: string[]) {
      for (const c of classes) {
        this.classes.delete(c);
      }
    },
  };
  return el;
}

describe("runCalcVectors persistence error reporting (#9)", () => {
  let mockBtn: HTMLButtonElement;
  let mockStatusText: HTMLElement;
  let mockHoverBar: HTMLElement;
  let mockCtx: ScatterViewContext;
  let mockSyncPoints: ReturnType<typeof vi.fn>;
  let mockReconcile: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    noticeCalls.length = 0;
    vi.clearAllMocks();

    mockBtn = createMockEl() as unknown as HTMLButtonElement;
    mockStatusText = createMockEl() as unknown as HTMLElement;
    mockHoverBar = createMockEl() as unknown as HTMLElement;

    mockSyncPoints = vi.fn().mockResolvedValue(undefined);
    mockReconcile = vi.fn().mockResolvedValue(undefined);

    vi.mocked(getVectorStore).mockReturnValue({
      syncPoints: mockSyncPoints,
      reconcile: mockReconcile,
    } as unknown as ReturnType<typeof getVectorStore>);

    vi.mocked(fetchEmbedding).mockResolvedValue({
      embedding: [0.1, 0.2, 0.3],
      error: null,
    });

    mockCtx = {
      app: {} as any,
      settings: {
        embeddingModel: "bge-m3",
        embeddingApiBaseUrl: "http://localhost:11434/v1",
        language: "de",
      } as any,
      nodes: [
        {
          id: "note-1",
          path: "note-1.md",
          title: "Note 1",
          content: "Content of note 1",
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          connections: 0,
          folder: "",
        },
      ],
      scanVaultNotes: vi.fn().mockResolvedValue(undefined),
      applyLayout: vi.fn(),
      redraw: vi.fn(),
    } as unknown as ScatterViewContext;
  });

  it("reports success when SQLite sync succeeds", async () => {
    await runCalcVectors(mockCtx, mockBtn, mockStatusText, mockHoverBar);

    expect(mockSyncPoints).toHaveBeenCalledTimes(1);
    expect(mockReconcile).toHaveBeenCalledTimes(1);
    expect((mockStatusText as any).text).toContain("Vektoren OK");
    expect((mockHoverBar as any).text).toContain("[OK]");
    expect(noticeCalls.some((n) => n.message.includes("[OK]"))).toBe(true);
    expect(noticeCalls.some((n) => n.message.includes("[ERROR]"))).toBe(false);
  });

  it("surfaces error notice and suppresses OK when SQLite persistence fails", async () => {
    mockSyncPoints.mockRejectedValueOnce(new Error("SQLite disk I/O error"));

    await runCalcVectors(mockCtx, mockBtn, mockStatusText, mockHoverBar);

    expect(mockSyncPoints).toHaveBeenCalledTimes(1);
    expect((mockStatusText as any).text).toBe("Speicherfehler");
    expect((mockHoverBar as any).classes.has("is-error")).toBe(true);
    expect((mockHoverBar as any).text).toContain("SQLite-Persistierungsfehler: SQLite disk I/O error");

    const errorNotice = noticeCalls.find((n) => n.message.includes("[ERROR] Vektoren berechnet, aber Persistierung in SQLite fehlgeschlagen"));
    expect(errorNotice).toBeDefined();
    expect(errorNotice?.message).toContain("SQLite disk I/O error");
    expect(errorNotice?.duration).toBe(8000);

    // Verify [OK] notice is NOT emitted
    expect(noticeCalls.some((n) => n.message.includes("[OK]"))).toBe(false);
    expect(mockCtx.applyLayout).not.toHaveBeenCalled();
    expect(mockCtx.redraw).not.toHaveBeenCalled();
  });
});
