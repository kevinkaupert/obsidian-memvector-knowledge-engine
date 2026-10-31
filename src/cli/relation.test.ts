import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as yaml from "yaml";
import type { GateChild, GateSpawn } from "../noteWriter/jovianGate";
import { noteKeys, readVaultNotes, relationAdd } from "./relation";

// The gate runner uses window timers (Obsidian popout rule); the CLI sets window to globalThis, so do the tests
vi.stubGlobal("window", globalThis);
vi.mock("obsidian", () => ({ stringifyYaml: (o: unknown) => yaml.stringify(o), parseYaml: (t: string) => yaml.parse(t) }));

/** A gate that answers `ok` (or `error`) and records the request it got. */
function gate(answer: Record<string, unknown> = { v: 1, outcome: "ok", data: {} }, exitCode = 0) {
  const requests: Array<Record<string, unknown>> = [];
  const args: string[][] = [];
  const spawn: GateSpawn = (_command, a) => {
    args.push(a);
    const on: Record<string, (v: never) => void> = {};
    let out: (chunk: string) => void = () => undefined;
    return {
      stdout: { setEncoding: () => undefined, on: (_e: string, cb: (c: string) => void) => { out = cb; } },
      stderr: { setEncoding: () => undefined, on: () => undefined },
      stdin: { on: () => undefined, end: (data: string) => {
        requests.push(JSON.parse(data) as Record<string, unknown>);
        queueMicrotask(() => { out(JSON.stringify(answer)); on.close?.(exitCode as never); });
      } },
      on: (event: string, cb: (v: never) => void) => { on[event] = cb; },
      kill: () => undefined,
    } as unknown as GateChild;
  };
  return { spawn, requests, args };
}

function vault(): string {
  const root = mkdtempSync(join(tmpdir(), "mv-rel-"));
  mkdirSync(join(root, "Fragmente"));
  mkdirSync(join(root, "relations"));
  writeFileSync(join(root, "Fragmente/Gruppe (Definition).md"), "---\nid: 01M5H6A265W0YEDVWW1CHSKAGS\ntitle: Gruppe\ntype: definition\n---\n# Gruppe\n");
  writeFileSync(join(root, "Fragmente/Menge (Begriff).md"), "---\ntitle: Menge\n---\nMenge\n");
  writeFileSync(join(root, "knowos.json"), JSON.stringify({ relation_vocabulary: "vocab.json" }));
  writeFileSync(join(root, "vocab.json"), JSON.stringify({ terms: [{ key: "r", label: "REQUIRES", term: "setzt voraus", bidirectional: false }] }));
  return root;
}

const REQ = { v: 1, from: "Fragmente/Gruppe (Definition).md", to: "Fragmente/Menge (Begriff).md", relation: "requires", text: "Zuerst eine Menge." };
const SETTINGS = { relationsFolder: "relations", jovianCommand: "jovian" };

describe("memvector relation add", () => {
  it("writes the Relation Builder's note through the gate with create_new", async () => {
    const g = gate();
    const result = await relationAdd(vault(), REQ, SETTINGS, { spawn: g.spawn, clientVersion: "0.3.12" });
    expect(result.outcome).toBe("ok");
    expect(result.created).toBe(true);
    expect(result.path).toMatch(/^relations\/rel-01m5h6a265w0yedvww1chskags-to-fragmente-menge-20-begriff-requires-[0-9a-f]{64}\.md$/);
    const [request] = g.requests;
    expect(request).toMatchObject({ target: result.path, mode: "create_new", expected_hash: null,
      operation: "memvector.relation_save", client: { component: "memvector", version: "0.3.12" } });
    const content = String(request.content);
    expect(content).toContain("relation_type: REQUIRES");
    expect(content).toContain('source_note: "[[Fragmente/Gruppe (Definition)|Gruppe]]"');
    expect(content).toContain("original_term: setzt voraus");
    expect(content).toContain("Zuerst eine Menge.");
    expect(g.args[0]).toEqual(["change", "create", "--vault", expect.any(String), "--json"]);
  });

  it("answers an existing relation note with its path and writes nothing", async () => {
    const root = vault();
    writeFileSync(join(root, "relations/alt.md"), "---\ntype: relation\nrelation_type: REQUIRES\nsource_note: \"[[Gruppe (Definition)|Gruppe]]\"\ntarget_note: \"[[Fragmente/Menge (Begriff)]]\"\n---\n");
    const g = gate();
    const result = await relationAdd(root, REQ, SETTINGS, { spawn: g.spawn, clientVersion: "0" });
    expect(result).toEqual({ outcome: "ok", path: "relations/alt.md", created: false });
    expect(g.requests).toEqual([]);
  });

  it("reports the gate's refusal and missing notes", async () => {
    const refused = gate({ v: 1, outcome: "error", error: { code: "TARGET_EXISTS", message: "exists" } });
    expect(await relationAdd(vault(), REQ, SETTINGS, { spawn: refused.spawn, clientVersion: "0" }))
      .toEqual({ outcome: "error", code: "TARGET_EXISTS", error: "exists" });
    const g = gate();
    expect((await relationAdd(vault(), { ...REQ, to: "Fragmente/Fehlt.md" }, SETTINGS, { spawn: g.spawn, clientVersion: "0" })).code).toBe("NOTE_NOT_FOUND");
    expect((await relationAdd(vault(), { ...REQ, relation: "setzt voraus" }, SETTINGS, { spawn: g.spawn, clientVersion: "0" })).code).toBe("INVALID_REQUEST");
  });

  it("keys notes like noteKey.ts: a unique ULID, else the path key", () => {
    const keys = noteKeys(readVaultNotes(vault()));
    expect(keys.get("Fragmente/Gruppe (Definition).md")).toBe("01M5H6A265W0YEDVWW1CHSKAGS");
    expect(keys.get("Fragmente/Menge (Begriff).md")).toBe("fragmente/menge%20(begriff)");
  });

  it("asks the gate for a preview and writes nothing itself (knowOS ADR-0014 §3)", async () => {
    const preview = { preview: true, preview_id: "01M5PREVIEW", writes: [{ target: "relations/x.md", action: "create" }], result: {} };
    const g = gate({ v: 1, outcome: "ok", data: preview });
    const result = await relationAdd(vault(), { ...REQ, preview: true }, SETTINGS, { spawn: g.spawn, clientVersion: "0.3.15" });
    expect(result).toMatchObject({ outcome: "ok", created: false, preview });
    expect(g.requests[0]).toMatchObject({ preview: true, mode: "create_new" });
    expect(g.args[0]).toEqual(["change", "create", "--dry-run", "--vault", expect.any(String), "--json"]);
  });

  it("reports aborted on exit 130", async () => {
    const aborted = gate({ v: 1, outcome: "error" }, 130);
    const result = await relationAdd(vault(), REQ, SETTINGS, { spawn: aborted.spawn, clientVersion: "0" });
    expect(result).toEqual({ outcome: "error", code: "ABORTED", error: "Jovian call aborted." });
  });

  it("refuses a preview from a gate that does not know previews", async () => {
    const g = gate({ v: 1, outcome: "ok", data: { target: "relations/x.md" } });
    const result = await relationAdd(vault(), { ...REQ, preview: true }, SETTINGS, { spawn: g.spawn, clientVersion: "0.3.15" });
    expect(result).toMatchObject({ outcome: "error", code: "GATE_UNAVAILABLE" });
    const bad = await relationAdd(vault(), { ...REQ, preview: "ja" }, SETTINGS, { spawn: g.spawn, clientVersion: "0.3.15" });
    expect(bad).toMatchObject({ outcome: "error", code: "INVALID_REQUEST" });
  });
});
