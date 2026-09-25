import { describe, it, expect } from "vitest";
import { getTranslation } from "./index";
import { de } from "./de";
import { en } from "./en";

describe("i18n", () => {
  it("has exact parity between German and English translation keys", () => {
    const deKeys = Object.keys(de).sort();
    const enKeys = Object.keys(en).sort();
    expect(deKeys).toEqual(enKeys);

    for (const key of deKeys) {
      expect(de[key as keyof typeof de]).toBeTruthy();
      expect(en[key as keyof typeof en]).toBeTruthy();
    }
  });

  it("returns German translations by default and English when requested", () => {
    expect(getTranslation("de").provCustomRest).toBe("Benutzerdefinierter REST-Endpunkt");
    expect(getTranslation("en").provCustomRest).toBe("Custom REST endpoint");
    expect(getTranslation("unknown").provCustomRest).toBe("Benutzerdefinierter REST-Endpunkt");
  });
});
