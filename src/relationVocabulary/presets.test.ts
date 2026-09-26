import { describe, expect, it, vi } from "vitest";
import type { App, TFile } from "obsidian";
import { activatePreset, BUNDLED_PRESETS, createPreset, deletePreset, humanizePresetKey, listPresets, presetFilePath, renamePreset, sanitizePresetKey } from "./presets";
import type { MemVectorSettings, SettingsHost } from "../settings/types";
import { DEFAULT_RELATION_VOCABULARY } from "./defaultVocabulary";
import { DEFAULT_RELATION_VOCABULARY_PATH } from "./loadRelationVocabulary";

const { MockTFile } = vi.hoisted(() => {
  class MockTFile {
    path: string;
    constructor(path: string) {
      this.path = path;
    }
  }
  return { MockTFile };
});

vi.mock("obsidian", () => ({
  TFile: MockTFile,
  TFolder: MockTFile,
}));

interface FakeVault {
  files: Map<string, string>;
  app: App;
}

function fakeApp(initial: Record<string, string> = {}): FakeVault {
  const files = new Map(Object.entries(initial));
  const vault = {
    files,
    adapter: {
      list: async (folder: string) => {
        const prefix = folder.replace(/\/?$/, "/");
        const found: string[] = [];
        for (const path of files.keys()) {
          if (path.startsWith(prefix)) found.push(path);
        }
        return { folders: [], files: found };
      },
    },
    getAbstractFileByPath: (path: string) => (files.has(path) ? new MockTFile(path) : null),
    cachedRead: async (file: TFile) => {
      const content = files.get(file.path);
      if (content === undefined) throw new Error(`no file ${file.path}`);
      return content;
    },
    modify: async (file: TFile, content: string) => files.set(file.path, content),
    create: async (path: string, content: string) => files.set(path, content),
    createFolder: async () => undefined,
    rename: async (file: TFile, newPath: string) => {
      const content = files.get(file.path);
      files.delete(file.path);
      if (content !== undefined) files.set(newPath, content);
    },
    trash: async (file: TFile) => {
      files.delete(file.path);
    },
  };
  const app = { vault } as unknown as App;
  return { files, app };
}

function host(settings: Partial<MemVectorSettings> = {}): SettingsHost & { saved: number } {
  const h = {
    settings: { relationVocabularyPath: DEFAULT_RELATION_VOCABULARY_PATH, ...settings } as MemVectorSettings,
    saved: 0,
    saveSettings: async () => {
      h.saved++;
    },
  };
  return h;
}

describe("preset helpers", () => {
  it("sanitizes preset names into stable file keys", () => {
    expect(sanitizePresetKey("My Domain")).toBe("my-domain");
    expect(sanitizePresetKey("  Meine Domäne!! ")).toBe("meine-domane");
    expect(sanitizePresetKey("")).toBe("preset");
  });

  it("humanizes preset keys for display", () => {
    expect(humanizePresetKey("my-domain")).toBe("My Domain");
    expect(humanizePresetKey("law")).toBe("Law");
  });

  it("builds preset file paths under wiki/presets/", () => {
    expect(presetFilePath("stem")).toBe("wiki/presets/stem.json");
  });
});

describe("preset lifecycle (Issue #119)", () => {
  it("lists bundled presets even when no preset folder exists yet", async () => {
    const { app } = fakeApp();
    const presets = await listPresets(app);
    expect(presets.map((p) => p.key)).toEqual(expect.arrayContaining(["stem", "law", "medicine", "philosophy"]));
    expect(presets.find((p) => p.key === "stem")!.bundled).toBe(true);
  });

  it("lists user preset files alongside bundled presets", async () => {
    const { app } = fakeApp({
      "wiki/presets/my-domain.json": JSON.stringify({ terms: [] }),
    });
    const presets = await listPresets(app);
    const user = presets.find((p) => p.key === "my-domain");
    expect(user).toBeDefined();
    expect(user!.bundled).toBe(false);
    expect(user!.label).toBe("My Domain");
  });

  it("activates a bundled preset by writing its file and pointing relationVocabularyPath at it", async () => {
    const { files, app } = fakeApp();
    const h = host();
    await activatePreset(app, h, "law");

    expect(h.settings.relationVocabularyPath).toBe("wiki/presets/law.json");
    expect(h.saved).toBe(1);
    const raw = files.get("wiki/presets/law.json");
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!) as { terms: { label: string }[] };
    expect(parsed.terms.map((t) => t.label)).toEqual(expect.arrayContaining(["REGULATES", "AMENDS"]));
  });

  it("re-writes a missing bundled preset file from memory without touching an existing one", async () => {
    const existing = JSON.stringify({ terms: [{ key: "k", label: "KEEPME", term: "keepme", category: "X", bidirectional: false, reversed: false }] });
    const { files, app } = fakeApp({ "wiki/presets/stem.json": existing });
    const h = host();
    await activatePreset(app, h, "stem");
    expect(files.get("wiki/presets/stem.json")).toBe(existing);
  });

  it("creates a new preset seeded with the active vocabulary and activates it", async () => {
    const active = JSON.stringify({ terms: [{ key: "k", label: "IMPLIES", term: "implies", category: "Logic", bidirectional: false, reversed: false }] });
    const { files, app } = fakeApp({ "wiki/relation-types.json": active });
    const h = host();
    const preset = await createPreset(app, h, "My Domain");

    expect(preset.key).toBe("my-domain");
    expect(h.settings.relationVocabularyPath).toBe("wiki/presets/my-domain.json");
    const parsed = JSON.parse(files.get("wiki/presets/my-domain.json")!) as { terms: { label: string }[] };
    expect(parsed.terms.map((t) => t.label)).toEqual(["IMPLIES"]);
  });

  it("seeds a new preset with the STEM default when the active file is missing", async () => {
    const { files, app } = fakeApp();
    const h = host();
    await createPreset(app, h, "Fresh");
    const parsed = JSON.parse(files.get("wiki/presets/fresh.json")!) as { terms: { label: string }[] };
    expect(parsed.terms.length).toBe(DEFAULT_RELATION_VOCABULARY.length);
  });

  it("refuses to create a preset whose file already exists", async () => {
    const { app } = fakeApp({ "wiki/presets/dup.json": "{}" });
    const h = host();
    await expect(createPreset(app, h, "dup")).rejects.toThrow(/already exists/i);
  });

  it("renames a user preset and updates the active path when it was active", async () => {
    const content = JSON.stringify({ terms: [] });
    const { files, app } = fakeApp({ "wiki/presets/old-name.json": content });
    const h = host({ relationVocabularyPath: "wiki/presets/old-name.json" });

    const renamed = await renamePreset(app, h, "old-name", "New Name");
    expect(renamed.key).toBe("new-name");
    expect(files.has("wiki/presets/old-name.json")).toBe(false);
    expect(files.get("wiki/presets/new-name.json")).toBe(content);
    expect(h.settings.relationVocabularyPath).toBe("wiki/presets/new-name.json");
  });

  it("refuses to rename bundled presets", async () => {
    const { app } = fakeApp();
    const h = host();
    await expect(renamePreset(app, h, "stem", "x")).rejects.toThrow(/cannot be renamed/i);
  });

  it("deletes a user preset and falls back to the default path when it was active", async () => {
    const { files, app } = fakeApp({ "wiki/presets/gone.json": "{}" });
    const h = host({ relationVocabularyPath: "wiki/presets/gone.json" });

    await deletePreset(app, h, "gone");
    expect(files.has("wiki/presets/gone.json")).toBe(false);
    expect(h.settings.relationVocabularyPath).toBe(DEFAULT_RELATION_VOCABULARY_PATH);
  });

  it("refuses to delete bundled presets", async () => {
    const { app } = fakeApp();
    const h = host();
    await expect(deletePreset(app, h, "law")).rejects.toThrow(/cannot be deleted/i);
  });

  it("ships at least one bundled preset beyond STEM (Issue #119 DoD)", () => {
    expect(Object.keys(BUNDLED_PRESETS).length).toBeGreaterThanOrEqual(2);
    expect(BUNDLED_PRESETS.law.terms.length).toBeGreaterThan(0);
    expect(BUNDLED_PRESETS.medicine.terms.length).toBeGreaterThan(0);
    expect(BUNDLED_PRESETS.philosophy.terms.length).toBeGreaterThan(0);
  });
});
