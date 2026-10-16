import { describe, expect, it } from "vitest";
import { newNoteId } from "./noteId";

describe("newNoteId (knowOS ADR-0002)", () => {
  it("produces a 26-character Crockford Base32 ULID", () => {
    expect(newNoteId()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("encodes the timestamp in the first 10 characters so ids sort by creation time", () => {
    const zero = () => new Uint8Array(16);
    expect(newNoteId(0, zero)).toBe("0".repeat(26));
    expect(newNoteId(1_700_000_000_000, zero) < newNoteId(1_700_000_000_001, zero)).toBe(true);
    // Reference value from the ULID spec encoding of 1469918176385 ms.
    expect(newNoteId(1469918176385, zero).slice(0, 10)).toBe("01ARYZ6S41");
  });

  it("differs between calls in the same millisecond", () => {
    expect(newNoteId(1_700_000_000_000)).not.toBe(newNoteId(1_700_000_000_000));
  });
});
