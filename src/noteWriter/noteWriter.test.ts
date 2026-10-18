import { describe, expect, it, vi } from "vitest";
import type { App, TFile } from "obsidian";

vi.mock("obsidian", async () => {
  const yaml = await import("yaml");
  return {
    TFile: class { constructor(public path: string) {} },
    TFolder: class {},
    FileSystemAdapter: class {
      getBasePath() { return "/vault"; }
      readBinary(path: string) { return Promise.resolve(new TextEncoder().encode(`read ${path}`).buffer); }
    },
    Notice: class {},
    stringifyYaml: (obj: unknown) => yaml.stringify(obj),
    parseYaml: (str: string) => yaml.parse(str),
  };
});

import { FileSystemAdapter, TFile as MockTFile } from "obsidian";
import { chooseNoteWriter, createJovianWriter, createNativeWriter, decodeNote, NoteWriteError } from "./noteWriter";
import type { GateCall } from "./jovianGate";
import { writeRelationFile } from "../modals/relationBuilder/relationFileWriter";
import { saveRelation } from "../modals/relationBuilder/relationSave";
import type { GraphStore } from "../sync/graphStore";

const ok = (data: Record<string, unknown> = {}): GateCall => ({ exitCode: 0, result: { v: 1, outcome: "ok", data } });
const error = (code: string, extra: Record<string, unknown> = {}): GateCall => ({
  exitCode: 1,
  result: { v: 1, outcome: "error", error: { code, message: `${code} message`, ...extra } },
});

/** A fake gate: records each request and answers from `answers` in order. */
function fakeGate(...answers: GateCall[]) {
  const requests: Array<{ command: string; request: Record<string, unknown> }> = [];
  const run = vi.fn(async (_inv: unknown, args: string[], request: unknown) => {
    requests.push({ command: args[0], request: request as Record<string, unknown> });
    return answers.shift() ?? ok();
  });
  return { run, requests };
}

const file = (path: string) => Object.assign(new MockTFile(), { path }) as unknown as TFile;

function jovian(gate: ReturnType<typeof fakeGate>, notes: Record<string, string> = {}) {
  return createJovianWriter({
    vaultPath: "/vault",
    jovianCommand: "",
    clientVersion: "0.3.1",
    readBytes: async (path) => new TextEncoder().encode(notes[path] ?? "").buffer,
    run: gate.run as never,
    newRequestId: () => "req-1",
  });
}

describe("Jovian writer (#274)", () => {
  it("creates a note with create_new and no expected hash", async () => {
    const gate = fakeGate(ok({ target: "wiki/synthesis/s.md" }));
    await jovian(gate).create("wiki/synthesis/s.md", "# S\n", "memvector.synthesis_save");
    expect(gate.requests).toEqual([{
      command: "write",
      request: {
        v: 1,
        client: { component: "memvector", version: "0.3.1" },
        target: "wiki/synthesis/s.md",
        content: "# S\n",
        mode: "create_new",
        expected_hash: null,
        operation: "memvector.synthesis_save",
        request_id: "req-1",
        declared_removals: [],
      },
    }]);
  });

  it("updates with the hash of the bytes read and declares the removals check reports", async () => {
    const gate = fakeGate(ok({ removed_units: [{ fingerprint: "f1", text: "Old." }] }), ok());
    await jovian(gate, { "r.md": "Old.\n" }).update(file("r.md"), (current) => `${current}New.\n`, "memvector.relation_save");
    const { hash } = await decodeNote(new TextEncoder().encode("Old.\n").buffer);
    expect(gate.requests.map((r) => r.command)).toEqual(["check", "write"]);
    expect(gate.requests[0].request).toMatchObject({ mode: "update", expected_hash: hash, content: "Old.\nNew.\n" });
    expect(gate.requests[1].request).toMatchObject({ declared_removals: [{ fingerprint: "f1" }], operation: "memvector.relation_save" });
  });

  it.each([
    ["STALE_HASH", error("STALE_HASH", { rescue_path: ".jovian/conflicts/x.md" }), "changed since it was read"],
    ["TARGET_EXISTS", error("TARGET_EXISTS"), "TARGET_EXISTS"],
    ["timeout", { exitCode: 3, result: { v: 1, outcome: "timeout" } } as GateCall, "locked"],
    ["malformed output", { exitCode: 1, problem: "Traceback" } as GateCall, "Unclear answer"],
  ])("throws on %s and writes nothing else", async (_name, answer, message) => {
    const gate = fakeGate(answer);
    await expect(jovian(gate).create("a.md", "x", "memvector.relation_save")).rejects.toThrow(message);
    await expect(jovian(fakeGate(answer)).create("a.md", "x", "memvector.relation_save")).rejects.toBeInstanceOf(NoteWriteError);
    expect(gate.requests).toHaveLength(1);
  });

  it("does not write when check refuses the update", async () => {
    const gate = fakeGate(error("STALE_HASH"));
    await expect(jovian(gate, { "r.md": "a" }).update(file("r.md"), () => "b", "memvector.relation_save")).rejects.toThrow("changed");
    expect(gate.requests.map((r) => r.command)).toEqual(["check"]);
  });
});

function vaultApp(notes: Map<string, string>, adapter: unknown = {}) {
  const create = vi.fn(async (path: string, content: string) => {
    if (notes.has(path)) throw new Error("File already exists.");
    notes.set(path, content);
  });
  const modify = vi.fn(async (f: TFile, content: string) => {
    notes.set(f.path, content);
  });
  const app = {
    vault: {
      adapter,
      getAbstractFileByPath: (path: string) => (notes.has(path) ? file(path) : null),
      read: async (f: TFile) => notes.get(f.path) ?? "",
      createFolder: async () => undefined,
      create,
      modify,
    },
    fileManager: { trashFile: vi.fn(async (f: TFile) => notes.delete(f.path)) },
  } as unknown as App;
  return { app, create, modify };
}

describe("chooseNoteWriter", () => {
  it("stays native with the setting off, without probing", async () => {
    const probe = vi.fn();
    const writer = await chooseNoteWriter(vaultApp(new Map()).app, { writeViaJovian: false, jovianCommand: "", language: "de" }, { probe });
    expect(writer.id).toBe("native");
    expect(probe).not.toHaveBeenCalled();
  });

  it("falls back to native with a notice when the gate does not answer", async () => {
    const notify = vi.fn();
    const writer = await chooseNoteWriter(vaultApp(new Map(), new FileSystemAdapter()).app,
      { writeViaJovian: true, jovianCommand: "", language: "en" },
      { probe: async () => ({ ok: false, message: "command not found" }), notify });
    expect(writer.id).toBe("native");
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("command not found"));
  });

  it("uses Jovian when the gate answers with protocol 1", async () => {
    const writer = await chooseNoteWriter(vaultApp(new Map(), new FileSystemAdapter()).app,
      { writeViaJovian: true, jovianCommand: "", language: "de" },
      { probe: async () => ({ ok: true, message: "Jovian gate 0.25.6" }) });
    expect(writer.id).toBe("jovian");
  });
});

describe("relation notes through the gate", () => {
  const path = "wiki/relations/rel-a-to-b-requires.md";
  const old = "---\nid: 01ABC\ncustom: keep\n---\n\nUser text\n";
  const generated = "---\nrelation: REQUIRES\n---\n\n# A requires B\n";

  it("writes the same merged content natively and through the gate", async () => {
    const native = vaultApp(new Map([[path, old]]));
    await writeRelationFile(native.app, path, generated, path);

    const gate = fakeGate(ok(), ok());
    const viaGate = vaultApp(new Map([[path, old]]));
    await writeRelationFile(viaGate.app, path, generated, path, jovian(gate, { [path]: old }));

    expect(gate.requests[1].request.content).toBe(native.modify.mock.calls[0][1]);
    expect(viaGate.modify).not.toHaveBeenCalled();
  });

  it("does not fall back to a native create when the gate refuses", async () => {
    const f = vaultApp(new Map());
    await expect(writeRelationFile(f.app, path, generated, undefined, jovian(fakeGate(error("TARGET_EXISTS")))))
      .rejects.toThrow("TARGET_EXISTS");
    expect(f.create).not.toHaveBeenCalled();
  });

  it("restores an edited note through the gate when the graph write fails", async () => {
    const f = vaultApp(new Map([[path, old]]));
    const gate = fakeGate(ok(), ok(), ok(), ok());
    const store = { upsertTypedEdges: async () => { throw new Error("graph down"); } } as unknown as GraphStore;
    const edge = { src: { id: "a", path: "A.md", title: "A" }, tgt: { id: "b", path: "B.md", title: "B" }, relType: "REQUIRES", description: "" };
    await expect(saveRelation(f.app, store, path, generated, edge, { path, srcId: "a", tgtId: "b", relType: "REQUIRES" },
      undefined, jovian(gate, { [path]: old }))).rejects.toThrow("graph down");
    expect(gate.requests.map((r) => [r.command, r.request.operation])).toEqual([
      ["check", undefined], ["write", "memvector.relation_save"], ["check", undefined], ["write", "memvector.relation_revert"],
    ]);
    expect(gate.requests[3].request.content).toBe(old);
    expect(f.modify).not.toHaveBeenCalled();
  });
});

describe("native writer", () => {
  it("creates and updates through the vault API as before", async () => {
    const f = vaultApp(new Map([["a.md", "A"]]));
    const writer = createNativeWriter(f.app);
    await writer.create("b.md", "B", "memvector.synthesis_save");
    await writer.update(file("a.md"), (current) => `${current}!`, "memvector.relation_save");
    expect(f.create).toHaveBeenCalledWith("b.md", "B");
    expect(f.modify).toHaveBeenCalledWith(expect.objectContaining({ path: "a.md" }), "A!");
  });
});
