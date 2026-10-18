/**
 * Purpose: Where MemVector writes its own notes (synthesis and relation notes): natively through Obsidian's vault, or
 * optionally through Jovian's write gate (#274, knowOS Plan 0007 §6).
 * Architecture: The writer is chosen before a save. After a gate call for a change started, nothing falls back to the
 * native path (knowOS ADR-0004 §4, docs/contracts/jovian-gate.md §6): every refusal or unclear answer is thrown as a
 * NoteWriteError and the caller's existing error path reports it. Folders are still created natively, since the gate
 * writes notes only.
 */

import { FileSystemAdapter, Notice, type App, type TFile } from "obsidian";
import type { MemVectorSettings } from "../settings/types";
import {
  JOVIAN_GATE_CALL_TIMEOUT_MS,
  probeGate,
  resolveGateInvocation,
  runGate,
  textField,
  type GateCall,
  type GateProbeResult,
} from "./jovianGate";

/** `<component>.<action>` recorded in Jovian's journal. */
export type NoteWriteOperation = "memvector.synthesis_save" | "memvector.relation_save" | "memvector.relation_revert";

export interface NoteWriter {
  readonly id: "native" | "jovian";
  /** Creates a new note and refuses an existing one. The parent folder must exist. */
  create(path: string, content: string, operation: NoteWriteOperation): Promise<void>;
  /** Replaces a note with `compute(current)`, where `current` is the text read for this write. */
  update(file: TFile, compute: (current: string) => string, operation: NoteWriteOperation): Promise<void>;
}

/** A write the gate refused or could not confirm; nothing was written. */
export class NoteWriteError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "NoteWriteError";
  }
}

/** Obsidian's vault API, as before #274. */
export function createNativeWriter(app: App): NoteWriter {
  return {
    id: "native",
    async create(path, content) {
      await app.vault.create(path, content);
    },
    async update(file, compute) {
      const current = await app.vault.read(file);
      await app.vault.modify(file, compute(current));
    },
  };
}

let pluginVersion = "0.0.0";

/** Set from the manifest at load; sent as `client.version`. */
export function setNoteWriterClientVersion(version: string): void {
  pluginVersion = version;
}

export interface JovianWriterOptions {
  vaultPath: string;
  jovianCommand: string;
  /** Raw bytes of a vault-relative file; the expected hash is computed over exactly these bytes. */
  readBytes(path: string): Promise<ArrayBuffer>;
  clientVersion?: string;
  run?: typeof runGate;
  newRequestId?: () => string;
}

/** Writes through `jovian gate check|write` (protocol 1). */
export function createJovianWriter(options: JovianWriterOptions): NoteWriter {
  const run = options.run ?? runGate;
  const newRequestId = options.newRequestId ?? (() => crypto.randomUUID());
  const call = (command: "check" | "write", request: Record<string, unknown>): Promise<GateCall> =>
    run(resolveGateInvocation(options.jovianCommand), [command, "--vault", options.vaultPath, "--json"], request, JOVIAN_GATE_CALL_TIMEOUT_MS);
  const base = (target: string, content: string, expectedHash: string | null) => ({
    v: 1,
    client: { component: "memvector", version: options.clientVersion ?? pluginVersion },
    target,
    content,
    mode: expectedHash === null ? "create_new" : "update",
    expected_hash: expectedHash,
  });
  const write = async (request: Record<string, unknown>, operation: NoteWriteOperation, removals: Array<{ fingerprint: string }>) => {
    const written = await call("write", { ...request, operation, request_id: newRequestId(), declared_removals: removals });
    if (written.result?.outcome !== "ok") throw rejected(written, String(request.target));
  };

  return {
    id: "jovian",
    async create(path, content, operation) {
      await write(base(path, content, null), operation, []);
    },
    async update(file, compute, operation) {
      let current: { content: string; hash: string };
      try {
        current = await decodeNote(await options.readBytes(file.path));
      } catch (err) {
        throw new NoteWriteError(`Could not read ${file.path}: ${errorText(err)}`, "READ_FAILED");
      }
      const request = base(file.path, compute(current.content), current.hash);
      // The user asked for this change in MemVector's dialog, so the units it replaces are declared as reviewed.
      // The gate still refuses the write when the note changed since it was read (STALE_HASH).
      const checked = await call("check", request);
      if (checked.result?.outcome !== "ok") throw rejected(checked, file.path);
      const units = Array.isArray(checked.result.data?.removed_units)
        ? (checked.result.data.removed_units as Array<{ fingerprint?: unknown }>)
        : [];
      await write(request, operation, units.map((u) => ({ fingerprint: textField(u.fingerprint) })));
    },
  };
}

/** Decodes a note's bytes as UTF-8, keeping a byte order mark, and hashes the bytes (SHA-256 hex). */
export async function decodeNote(bytes: ArrayBuffer): Promise<{ content: string; hash: string }> {
  const content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return { content, hash };
}

/** Maps a gate answer that is not `ok` to an error; nothing was written in any of these cases. */
function rejected(call: GateCall, target: string): NoteWriteError {
  const result = call.result;
  if (result?.outcome === "error") {
    const code = textField(result.error?.code) || "ERROR";
    const message = textField(result.error?.message);
    if (code === "STALE_HASH") {
      const rescuePath = textField(result.error?.rescue_path);
      const rescue = rescuePath ? ` Content saved to ${rescuePath}.` : "";
      return new NoteWriteError(`${target} changed since it was read; nothing written.${rescue} Please save again.`, code);
    }
    return new NoteWriteError(`Jovian did not write ${target} (${code}): ${message}`, code);
  }
  if (result?.outcome === "timeout" || call.exitCode === 3) {
    return new NoteWriteError(`${target} is locked (Jovian timeout); nothing written. Please try again.`, "TIMEOUT");
  }
  return new NoteWriteError(
    `Unclear answer from Jovian (${call.problem ?? "no result"}); not written natively, please check ${target}.`,
    "UNCLEAR"
  );
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface ChooseNoteWriterDeps {
  probe?: (jovianCommand: string) => Promise<GateProbeResult>;
  notify?: (message: string) => void;
  jovianWriter?: (options: JovianWriterOptions) => NoteWriter;
}

/**
 * Chooses the writer for one save: native unless `writeViaJovian` is on and `jovian gate --version` answers with
 * protocol 1. When Jovian was requested but is not reachable, the save is native and the user is told.
 */
export async function chooseNoteWriter(
  app: App,
  settings: Pick<MemVectorSettings, "writeViaJovian" | "jovianCommand" | "language"> | undefined,
  deps: ChooseNoteWriterDeps = {}
): Promise<NoteWriter> {
  if (!settings?.writeViaJovian) return createNativeWriter(app);
  const notify = deps.notify ?? ((message: string) => new Notice(message, 8000));
  const de = (settings.language || "de") === "de";
  const adapter = app.vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) {
    notify(de ? "MemVector: Jovian braucht einen lokalen Vault; direkt gespeichert." : "MemVector: Jovian needs a local vault; saved directly.");
    return createNativeWriter(app);
  }
  const probe = await (deps.probe ?? ((command: string) => probeGate(command)))(settings.jovianCommand ?? "");
  if (!probe.ok) {
    notify(de ? `MemVector: Jovian nicht erreichbar (${probe.message}); direkt gespeichert.` : `MemVector: Jovian not reachable (${probe.message}); saved directly.`);
    return createNativeWriter(app);
  }
  return (deps.jovianWriter ?? createJovianWriter)({
    vaultPath: adapter.getBasePath(),
    jovianCommand: settings.jovianCommand ?? "",
    readBytes: (path) => adapter.readBinary(path),
  });
}
