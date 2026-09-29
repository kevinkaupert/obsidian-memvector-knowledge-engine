import { describe, expect, it, vi } from "vitest";
import type { App, TFile } from "obsidian";
import { renderRelationTypesSection, renderTypeTable } from "./relationTypesSection";
import { getTranslation } from "../../i18n";
import type { SettingsHost } from "../types";
import type { RelationTermDef } from "../../relationVocabulary/types";
import { withBundledLayoutDefaults } from "../../relationVocabulary/layoutDefaults";

const { MockTFile, textComponents } = vi.hoisted(() => {
  class MockTFile {
    path: string;
    constructor(path: string) {
      this.path = path;
    }
  }
  // Text components the section creates, in creation order, so a test can drive the real
  // blur/Enter handlers the vocabulary path field registers.
  const textComponents: {
    value: string;
    listeners: Record<string, ((ev: unknown) => void)[]>;
    fire: (type: string, ev?: unknown) => void;
  }[] = [];
  return { MockTFile, textComponents };
});

vi.mock("obsidian", () => {
  const stub = () => ({ addClass: () => undefined, removeClass: () => undefined });
  class FakeSetting {
    settingEl = stub();
    controlEl = stub();
    setName() {
      return this;
    }
    setDesc() {
      return this;
    }
    setHeading() {
      return this;
    }
    addDropdown(cb: (d: unknown) => void) {
      cb({ addOption: () => undefined, setValue: () => undefined, onChange: () => undefined });
      return this;
    }
    addText(cb: (c: unknown) => void) {
      const listeners: Record<string, ((ev: unknown) => void)[]> = {};
      const component = {
        value: "",
        listeners,
        fire: (type: string, ev: unknown = {}) => (listeners[type] ?? []).forEach((fn) => fn(ev)),
      };
      textComponents.push(component);
      const api = {
        inputEl: {
          addClass: () => undefined,
          addEventListener: (type: string, fn: (ev: unknown) => void) => {
            (listeners[type] ??= []).push(fn);
          },
        },
        setPlaceholder() {
          return api;
        },
        setValue(v: string) {
          component.value = v;
          return api;
        },
        getValue: () => component.value,
        onChange() {
          return api;
        },
      };
      cb(api);
      return this;
    }
  }
  return {
    TFile: MockTFile,
    TFolder: MockTFile,
    Notice: class {
      constructor(public message: string) {}
    },
    Modal: class {},
    Setting: FakeSetting,
  };
});

const PATH = "wiki/relation-types.json";
const t = getTranslation("en");

/** Minimal stand-in for the Obsidian-extended HTMLElement API this table uses. */
interface FakeEl {
  tag: string;
  text: string;
  type?: string;
  value: string;
  checked: boolean;
  children: FakeEl[];
  onchange?: () => void;
  onclick?: () => void;
  [key: string]: unknown;
}

function el(tag: string, opts?: { text?: string; cls?: string; type?: string; placeholder?: string }): FakeEl {
  const node: FakeEl = {
    tag,
    text: opts?.text ?? "",
    type: opts?.type,
    value: "",
    checked: false,
    children: [],
    createEl: (t2: string, o?: never) => {
      const child = el(t2, o);
      node.children.push(child);
      return child;
    },
    createDiv: (o?: never) => (node.createEl as (t: string, o?: never) => FakeEl)("div", o),
    createSpan: (o?: never) => (node.createEl as (t: string, o?: never) => FakeEl)("span", o),
    addClass: () => undefined,
    removeClass: () => undefined,
    setText: (v: string) => {
      node.text = v;
    },
    setAttribute: () => undefined,
    prepend: () => undefined,
    empty: () => {
      node.children = [];
    },
  };
  return node;
}

/** The table only uses the subset of the element API modelled above. */
const asEl = (node: FakeEl): HTMLElement => node as unknown as HTMLElement;

function walk(node: FakeEl, out: FakeEl[] = []): FakeEl[] {
  out.push(node);
  for (const c of node.children) walk(c, out);
  return out;
}

/** Fake vault modelling Vault.process: atomic section, concurrent calls serialized. */
function fakeApp(terms: RelationTermDef[]) {
  const files = new Map([[PATH, JSON.stringify({ terms }, null, 2)]]);
  let queue: Promise<unknown> = Promise.resolve();
  const vault = {
    adapter: {
      list: async (folder: string) => {
        const prefix = folder.replace(/\/?$/, "/");
        return { folders: [], files: [...files.keys()].filter((f) => f.startsWith(prefix)) };
      },
    },
    getAbstractFileByPath: (p: string) => (files.has(p) ? new MockTFile(p) : null),
    cachedRead: async (file: TFile) => {
      const content = files.get(file.path);
      if (content === undefined) throw new Error(`no file ${file.path}`);
      return content;
    },
    process: (file: TFile, fn: (data: string) => string) => {
      const run = async () => {
        await Promise.resolve();
        const before = files.get(file.path)!;
        const after = fn(before);
        files.set(file.path, after);
        return after;
      };
      const next = queue.then(run, run);
      queue = next.catch(() => undefined);
      return next;
    },
  };
  const fileManager = {
    trashFile: async (file: TFile) => {
      files.delete(file.path);
    },
  };
  return {
    app: { vault, fileManager } as unknown as App,
    files,
    saved: (): RelationTermDef[] => JSON.parse(files.get(PATH)!).terms,
    find: (label: string) => (JSON.parse(files.get(PATH)!).terms as RelationTermDef[]).find((x) => x.label === label),
    writeExternally: (next: RelationTermDef[]) => files.set(PATH, JSON.stringify({ terms: next }, null, 2)),
  };
}

function renderTable(app: App, terms: RelationTermDef[]) {
  const parent = el("div");
  const host = {
    settings: { relationVocabularyPath: PATH },
    saveSettings: async () => undefined,
    applySettingsToOpenViews: () => undefined,
  } as unknown as SettingsHost;
  // The table renders from the loader's view of the file, defaults already filled in.
  renderTypeTable(asEl(parent), withBundledLayoutDefaults(terms), () => PATH, app, host, t, () => undefined);
  const all = walk(parent);
  const inputs = all.filter((n) => n.tag === "input");
  return {
    weightInput: inputs.find((n) => n.type === "number")!,
    repelsInput: inputs.find((n) => n.type === "checkbox")!,
    deleteButton: all.find((n) => n.tag === "button" && n.text === "✕")!,
  };
}

/** Renders the table and returns the add form's controls. */
function renderAddForm(app: App, terms: RelationTermDef[]) {
  const parent = el("div");
  const host = {
    settings: { relationVocabularyPath: PATH },
    saveSettings: async () => undefined,
    applySettingsToOpenViews: () => undefined,
  } as unknown as SettingsHost;
  renderTypeTable(asEl(parent), withBundledLayoutDefaults(terms), () => PATH, app, host, t, () => undefined);
  const all = walk(parent);
  const inputs = all.filter((n) => n.tag === "input");
  const texts = inputs.filter((n) => n.type === "text");
  const checkboxes = inputs.filter((n) => n.type === "checkbox");
  return {
    label: texts[0],
    category: texts[1],
    weight: inputs.filter((n) => n.type === "number").at(-1)!,
    // The add form's checkboxes are bidirectional then repels, after any row checkboxes.
    repels: checkboxes.at(-1)!,
    addButton: all.filter((n) => n.tag === "button").at(-1)!,
  };
}

const conflicts: RelationTermDef = {
  key: "relConflictsWith",
  label: "CONFLICTS_WITH",
  term: "conflicts with",
  category: "Logic & Implication",
  bidirectional: true,
  reversed: false,
  repels: true,
};

/** Lets the handler's fire-and-forget promise chain settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("relation type table handlers", () => {
  it("writes only the weight when the weight field changes", async () => {
    const env = fakeApp([conflicts]);
    const table = renderTable(env.app, [conflicts]);

    table.weightInput.value = "2";
    table.weightInput.onchange!();
    await settle();

    expect(env.find("CONFLICTS_WITH")?.weight).toBe(2);
    expect(env.find("CONFLICTS_WITH")?.repels).toBe(true);
  });

  it("does not revert a repels change made elsewhere when the weight is edited", async () => {
    const env = fakeApp([conflicts]);
    // Table rendered while repulsion is still on.
    const table = renderTable(env.app, [conflicts]);

    // Someone else turns it off - another window, or the file edited directly.
    env.writeExternally([{ ...conflicts, repels: false, weight: 1 }]);

    table.weightInput.value = "2";
    table.weightInput.onchange!();
    await settle();

    expect(env.find("CONFLICTS_WITH")?.repels).toBe(false);
    expect(env.find("CONFLICTS_WITH")?.weight).toBe(2);
  });

  it("does not revert a weight change made elsewhere when repels is toggled", async () => {
    const env = fakeApp([conflicts]);
    const table = renderTable(env.app, [conflicts]);

    env.writeExternally([{ ...conflicts, weight: 3, repels: true }]);

    table.repelsInput.checked = false;
    table.repelsInput.onchange!();
    await settle();

    expect(env.find("CONFLICTS_WITH")?.weight).toBe(3);
    expect(env.find("CONFLICTS_WITH")?.repels).toBe(false);
  });

  it("keeps the first edit when a second row is edited from the same table", async () => {
    const a: RelationTermDef = { key: "a", label: "A", term: "a", category: "C", bidirectional: false, reversed: false };
    const b: RelationTermDef = { key: "b", label: "B", term: "b", category: "C", bidirectional: false, reversed: false };
    const env = fakeApp([a, b]);
    const parent = el("div");
    const host = {
      settings: { relationVocabularyPath: PATH },
      saveSettings: async () => undefined,
      applySettingsToOpenViews: () => undefined,
    } as unknown as SettingsHost;
    renderTypeTable(asEl(parent), [a, b], () => PATH, env.app, host, t, () => undefined);
    const numbers = walk(parent).filter((n) => n.tag === "input" && n.type === "number");

    numbers[0].value = "2";
    numbers[0].onchange!();
    numbers[1].value = "3";
    numbers[1].onchange!();
    await settle();

    expect(env.find("A")?.weight).toBe(2);
    expect(env.find("B")?.weight).toBe(3);
  });

  it("keeps concurrent edits from two independently rendered tables", async () => {
    const a: RelationTermDef = { key: "a", label: "A", term: "a", category: "C", bidirectional: false, reversed: false };
    const b: RelationTermDef = { key: "b", label: "B", term: "b", category: "C", bidirectional: false, reversed: false };
    const env = fakeApp([a, b]);

    const parentOne = el("div");
    const parentTwo = el("div");
    const host = {
      settings: { relationVocabularyPath: PATH },
      saveSettings: async () => undefined,
      applySettingsToOpenViews: () => undefined,
    } as unknown as SettingsHost;
    renderTypeTable(asEl(parentOne), [a, b], () => PATH, env.app, host, t, () => undefined);
    renderTypeTable(asEl(parentTwo), [a, b], () => PATH, env.app, host, t, () => undefined);

    const one = walk(parentOne).filter((n) => n.tag === "input" && n.type === "number");
    const two = walk(parentTwo).filter((n) => n.tag === "input" && n.type === "number");

    // Fired back to back, before either write has settled.
    one[0].value = "2";
    one[0].onchange!();
    two[1].value = "3";
    two[1].onchange!();
    await settle();

    expect(env.find("A")?.weight).toBe(2);
    expect(env.find("B")?.weight).toBe(3);
  });

  it("keeps an explicitly unticked repels when adding a bundled label", async () => {
    // Preset without CONFLICTS_WITH; the user adds it with repulsion deliberately off.
    const env = fakeApp([{ key: "a", label: "A", term: "a", category: "C", bidirectional: false, reversed: false }]);
    const form = renderAddForm(env.app, []);

    form.label.value = "CONFLICTS_WITH";
    form.weight.value = "1";
    form.repels.checked = false;
    form.addButton.onclick!();
    await settle();

    const saved = env.find("CONFLICTS_WITH")!;
    expect(saved).toBeDefined();
    // Omitting both fields here would hand the label back to the bundled repels: true.
    expect(withBundledLayoutDefaults([saved])[0].repels).toBe(false);
  });

  it("keeps an explicit weight 1.0 on a label whose bundled weight is not 1.0", async () => {
    const env = fakeApp([{ key: "a", label: "A", term: "a", category: "C", bidirectional: false, reversed: false }]);
    const form = renderAddForm(env.app, []);

    form.label.value = "EQUIVALENT_TO";
    form.weight.value = "1";
    form.repels.checked = false;
    form.addButton.onclick!();
    await settle();

    const saved = env.find("EQUIVALENT_TO")!;
    expect(withBundledLayoutDefaults([saved])[0].weight).toBe(1);
  });

  it("still omits both fields for a plain custom type, keeping the file readable", async () => {
    const env = fakeApp([{ key: "a", label: "A", term: "a", category: "C", bidirectional: false, reversed: false }]);
    const form = renderAddForm(env.app, []);

    form.label.value = "IS_HOMOMORPHIC_TO";
    form.weight.value = "1";
    form.repels.checked = false;
    form.addButton.onclick!();
    await settle();

    const saved = env.find("IS_HOMOMORPHIC_TO")!;
    expect(saved.weight).toBeUndefined();
    expect(saved.repels).toBeUndefined();
  });

  it("persists an explicit non-default weight and repels from the add form", async () => {
    const env = fakeApp([{ key: "a", label: "A", term: "a", category: "C", bidirectional: false, reversed: false }]);
    const form = renderAddForm(env.app, []);

    form.label.value = "PUSHES_AWAY";
    form.weight.value = "2.5";
    form.repels.checked = true;
    form.addButton.onclick!();
    await settle();

    expect(env.find("PUSHES_AWAY")).toMatchObject({ weight: 2.5, repels: true });
  });

  it("keeps a weight edit when a row is deleted right afterwards", async () => {
    const a: RelationTermDef = { key: "a", label: "A", term: "a", category: "C", bidirectional: false, reversed: false };
    const b: RelationTermDef = { key: "b", label: "B", term: "b", category: "C", bidirectional: false, reversed: false };
    const env = fakeApp([a, b]);
    const parent = el("div");
    const host = {
      settings: { relationVocabularyPath: PATH },
      saveSettings: async () => undefined,
      applySettingsToOpenViews: () => undefined,
    } as unknown as SettingsHost;
    renderTypeTable(asEl(parent), [a, b], () => PATH, env.app, host, t, () => undefined);
    const all = walk(parent);
    const numbers = all.filter((n) => n.tag === "input" && n.type === "number");
    const deletes = all.filter((n) => n.tag === "button" && n.text === "✕");

    numbers[0].value = "2";
    numbers[0].onchange!();
    deletes[1].onclick!();
    await settle();

    expect(env.saved().map((x) => x.label)).toEqual(["A"]);
    expect(env.find("A")?.weight).toBe(2);
  });

  it("deleting the last type leaves an empty vocabulary file without resurrecting STEM (Issue #139)", async () => {
    const single: RelationTermDef = { key: "a", label: "A", term: "a", category: "C", bidirectional: false, reversed: false };
    const env = fakeApp([single]);
    const table = renderTable(env.app, [single]);

    table.deleteButton.onclick!();
    await settle();

    expect(env.saved()).toEqual([]);
  });
});

describe("changing the active vocabulary source", () => {
  const OTHER = "wiki/presets/other.json";

  /** Renders the whole section and returns the vocabulary path field plus refresh spies. */
  async function renderSection(env: ReturnType<typeof fakeApp>, startPath: string) {
    textComponents.length = 0;
    const refreshes: unknown[] = [];
    let renders = 0;
    const host = {
      settings: { relationVocabularyPath: startPath, language: "en" },
      saveSettings: async () => undefined,
      applySettingsToOpenViews: (o: unknown) => refreshes.push(o),
    } as unknown as SettingsHost;

    const container = el("div");
    renderRelationTypesSection(asEl(container), env.app, host, t, () => {
      renders++;
    });
    await settle();
    // The path field is the only text component the section creates.
    return { host, refreshes, pathField: textComponents[0], renderCount: () => renders };
  }

  it("does not persist anything while the path is still being typed", async () => {
    const env = fakeApp([conflicts]);
    const { host, refreshes, pathField } = await renderSection(env, PATH);

    // Simulate typing: the component's value changes, but no commit event fires yet.
    pathField.value = "wiki/pre";

    expect(host.settings.relationVocabularyPath).toBe(PATH);
    expect(refreshes).toHaveLength(0);
  });

  it("commits the path on blur and refreshes the open view", async () => {
    const env = fakeApp([conflicts]);
    const { host, refreshes, pathField, renderCount } = await renderSection(env, PATH);
    const rendersBefore = renderCount();

    pathField.value = OTHER;
    pathField.fire("blur");
    await settle();

    expect(host.settings.relationVocabularyPath).toBe(OTHER);
    expect(refreshes).toEqual([{ relayout: true }]);
    // The table is rebuilt, so its rows stop writing to the previously active file.
    expect(renderCount()).toBe(rendersBefore + 1);
  });

  it("commits the path on Enter as well", async () => {
    const env = fakeApp([conflicts]);
    const { host, refreshes, pathField } = await renderSection(env, PATH);

    pathField.value = OTHER;
    pathField.fire("keydown", { key: "Enter", preventDefault: () => undefined });
    await settle();

    expect(host.settings.relationVocabularyPath).toBe(OTHER);
    expect(refreshes).toEqual([{ relayout: true }]);
  });

  it("ignores a commit that does not change the path", async () => {
    const env = fakeApp([conflicts]);
    const { refreshes, pathField, renderCount } = await renderSection(env, PATH);
    const rendersBefore = renderCount();

    pathField.fire("blur");
    await settle();

    expect(refreshes).toHaveLength(0);
    expect(renderCount()).toBe(rendersBefore);
  });

  it("falls back to the default path when the field is cleared", async () => {
    const env = fakeApp([conflicts]);
    const { host, pathField } = await renderSection(env, OTHER);

    pathField.value = "   ";
    pathField.fire("blur");
    await settle();

    expect(host.settings.relationVocabularyPath).toBe("wiki/relation-types.json");
  });
});

describe("table writes follow the active path, not the rendered one", () => {
  it("sends an edit to the file that is active at write time", async () => {
    const OTHER = "wiki/presets/other.json";
    const env = fakeApp([conflicts]);
    // A second vocabulary file that becomes active after the table was rendered.
    env.files.set(OTHER, JSON.stringify({ terms: [conflicts] }, null, 2));

    let current = PATH;
    const parent = el("div");
    const host = {
      settings: { relationVocabularyPath: PATH },
      saveSettings: async () => undefined,
      applySettingsToOpenViews: () => undefined,
    } as unknown as SettingsHost;
    renderTypeTable(asEl(parent), withBundledLayoutDefaults([conflicts]), () => current, env.app, host, t, () => undefined);

    // The active vocabulary changes while the rendered table is still on screen.
    current = OTHER;

    const weight = walk(parent).find((n) => n.tag === "input" && n.type === "number")!;
    weight.value = "2";
    weight.onchange!();
    await settle();

    expect(JSON.parse(env.files.get(OTHER)!).terms[0].weight).toBe(2);
    // The previously active file is untouched.
    expect(JSON.parse(env.files.get(PATH)!).terms[0].weight).toBeUndefined();
  });
});

describe("preset management refreshes the open view", () => {
  const USER_PRESET = "wiki/presets/mine.json";

  async function renderWithUserPreset(env: ReturnType<typeof fakeApp>) {
    textComponents.length = 0;
    const refreshes: unknown[] = [];
    const host = {
      settings: { relationVocabularyPath: USER_PRESET, language: "en" },
      saveSettings: async () => undefined,
      applySettingsToOpenViews: (o: unknown) => refreshes.push(o),
    } as unknown as SettingsHost;

    const container = el("div");
    renderRelationTypesSection(asEl(container), env.app, host, t, () => undefined);
    await settle();
    return { host, refreshes, buttons: walk(container).filter((n) => n.tag === "button") };
  }

  it("refreshes the open view when the active preset is deleted", async () => {
    const env = fakeApp([conflicts]);
    env.files.set(USER_PRESET, JSON.stringify({ terms: [conflicts] }, null, 2));
    const { host, refreshes, buttons } = await renderWithUserPreset(env);

    const deleteBtn = buttons.find((b) => b.text === t.relPresetDeleteBtn)!;
    expect(deleteBtn).toBeDefined();
    deleteBtn.onclick!();
    await settle();

    // The active vocabulary fell back to the default, so an open layout is now stale.
    expect(host.settings.relationVocabularyPath).toBe("wiki/relation-types.json");
    expect(refreshes).toContainEqual({ relayout: true });
  });
});
