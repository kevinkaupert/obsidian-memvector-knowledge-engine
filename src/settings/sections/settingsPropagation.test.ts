import { describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { getTranslation } from "../../i18n";
import { DEFAULT_SETTINGS } from "../defaults";
import type { OpenViewSettingsChange, SettingsHost } from "../types";

/**
 * Renders the real settings sections against a permissive fake of Obsidian's Setting API. Every control's onChange
 * handler is captured under the setting's name, so a test can change a value the way the user would.
 */
const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, (value: unknown) => Promise<void> | void>() }));

vi.mock("obsidian", () => {
  const chain = (onChange: (fn: (value: unknown) => unknown) => void): unknown =>
    new Proxy(
      {},
      {
        get: (_target, prop) => {
          if (prop === "onChange") return (fn: (value: unknown) => unknown) => (onChange(fn), chain(onChange));
          if (prop === "inputEl" || prop === "selectEl" || prop === "buttonEl" || prop === "toggleEl") return element();
          if (prop === "then") return undefined;
          return () => chain(onChange);
        },
      }
    );
  const element = (): unknown =>
    new Proxy(
      {},
      {
        get: (_target, prop) => {
          if (prop === "then") return undefined;
          if (prop === "style" || prop === "dataset") return {};
          return () => element();
        },
      }
    );
  class Setting {
    private name = "";
    settingEl = element();
    controlEl = element();
    nameEl = element();
    descEl = element();
    constructor(_container: unknown) {}
    setName(name: string) {
      this.name = name;
      return this;
    }
    setDesc() {
      return this;
    }
    setHeading() {
      return this;
    }
    setClass() {
      return this;
    }
    private add(cb: (component: unknown) => void) {
      cb(chain((fn) => handlers.set(this.name, fn as (value: unknown) => void)));
      return this;
    }
    addText = this.add;
    addTextArea = this.add;
    addDropdown = this.add;
    addToggle = this.add;
    addSlider = this.add;
    addButton = this.add;
    addExtraButton = this.add;
    addComponent = this.add;
  }
  class SecretComponent {
    setValue() {
      return this;
    }
    onChange() {
      return this;
    }
  }
  return { Setting, Notice: class {}, SecretComponent, TFile: class {}, TFolder: class {}, normalizePath: (p: string) => p, setIcon: () => undefined };
});

import { renderGeneralSection } from "./generalSection";
import { renderVectorFilterSection } from "./vectorFilterSection";

function makeHost(): SettingsHost & { applySettingsToOpenViews: ReturnType<typeof vi.fn<(options?: OpenViewSettingsChange) => void>> } {
  return {
    settings: { ...DEFAULT_SETTINGS },
    saveSettings: vi.fn(async () => {}),
    applySettingsToOpenViews: vi.fn<(options?: OpenViewSettingsChange) => void>(),
  };
}

const container = () =>
  new Proxy(
    {},
    {
      get: (_target, prop) => (prop === "then" ? undefined : () => container()),
    }
  ) as unknown as HTMLElement;

describe("settings changes reach open 2D views (#189)", () => {
  const t = getTranslation("en");

  it("changed indexing exclusions ask open views to rescan their notes", async () => {
    const host = makeHost();
    renderGeneralSection(container(), host, t, () => undefined);

    await handlers.get(t.exclusionsName)!("-path:archive");

    expect(host.settings.vectorSearchExclusions).toBe("-path:archive");
    expect(host.saveSettings).toHaveBeenCalled();
    expect(host.applySettingsToOpenViews).toHaveBeenCalledWith({ rescan: true });
  });

  it("a changed knowledge domain and the WikiLinks-as-relations toggle notify open views", async () => {
    const host = makeHost();
    renderVectorFilterSection(container(), { vault: {} } as unknown as App, host, t, () => undefined);

    await handlers.get(t.domainName)!("math");
    expect(host.settings.knowledgeDomain).toBe("math");
    expect(host.applySettingsToOpenViews).toHaveBeenCalledTimes(1);

    await handlers.get(t.wikiLinksAsRelationsName)!(true);
    expect(host.settings.includeWikiLinksAsRelations).toBe(true);
    expect(host.applySettingsToOpenViews).toHaveBeenCalledTimes(2);
  });
});
