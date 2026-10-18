/**
 * Purpose: Runs Jovian's write gate CLI (`jovian gate --version|check|write`, protocol 1) for optional note writes
 * through Jovian (#274, knowOS docs/contracts/jovian-gate.md).
 * Architecture: One process per call, one JSON request on stdin, one JSON result on stdout. `spawn` is injected so
 * tests run without Jovian; in Obsidian it is Node's `child_process.spawn`, loaded lazily because the bundle targets
 * the browser platform.
 */

/** Wait for `jovian gate --version` before the write falls back to the native path. */
export const JOVIAN_GATE_PROBE_TIMEOUT_MS = 10000;
/** Wait for `jovian gate check|write`; the gate's own lock timeout answers earlier (exit 3). */
export const JOVIAN_GATE_CALL_TIMEOUT_MS = 60000;

export interface GateInvocation {
  command: string;
  args: string[];
}

/** The subset of a Node child process the gate runner uses. */
export interface GateChild {
  stdout: { setEncoding(enc: string): void; on(event: "data", cb: (chunk: string) => void): void } | null;
  stderr: { setEncoding(enc: string): void; on(event: "data", cb: (chunk: string) => void): void } | null;
  stdin: { on(event: "error", cb: () => void): void; end(data: string): void } | null;
  on(event: "error", cb: (err: Error) => void): void;
  on(event: "close", cb: (code: number | null) => void): void;
  kill(): void;
}

export type GateSpawn = (command: string, args: string[], options: { env: Record<string, string | undefined> }) => GateChild;

/** What one gate process returned: its exit code and the JSON result on stdout, if it was one. */
export interface GateCall {
  exitCode: number | null;
  /** Parsed stdout; undefined when stdout was empty or not JSON. */
  result?: { v?: number; outcome?: string; data?: Record<string, unknown>; error?: Record<string, unknown> };
  /** Why no result exists: spawn error, timeout or the last stderr line. */
  problem?: string;
}

/** Splits a command line into tokens; single and double quotes keep paths with spaces together. */
export function splitCommandLine(commandLine: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let hasToken = false;
  for (const ch of commandLine) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      hasToken = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (hasToken) tokens.push(current);
      current = "";
      hasToken = false;
      continue;
    }
    current += ch;
    hasToken = true;
  }
  if (quote) throw new Error(`Unclosed quote in Jovian command: ${commandLine}`);
  if (hasToken) tokens.push(current);
  return tokens;
}

/**
 * Builds the gate invocation: a configured command is treated like the `jovian` CLI (e.g. `~/venv/bin/jovian`) and
 * gets `gate` appended; an empty command runs `python3 -m jovian.gate`.
 */
export function resolveGateInvocation(jovianCommand: string, home: string = homeDir()): GateInvocation {
  const tokens = splitCommandLine(jovianCommand.trim());
  if (tokens.length === 0) return { command: "python3", args: ["-m", "jovian.gate"] };
  const [first, ...rest] = tokens;
  const command = first === "~" || first.startsWith("~/") ? `${home}${first.slice(1)}` : first;
  return { command, args: [...rest, "gate"] };
}

/** Environment for the gate process: common user bin folders on PATH, since Obsidian starts with a minimal PATH. */
export function gateEnv(env: Record<string, string | undefined> = processEnv(), home: string = homeDir()): Record<string, string | undefined> {
  const extra = [`${home}/.local/bin`, "/opt/homebrew/bin", "/usr/local/bin"];
  return { ...env, PATH: [...extra, env.PATH || ""].filter(Boolean).join(":") };
}

/** Runs one gate command with `request` as JSON on stdin; never throws. */
export function runGate(
  invocation: GateInvocation,
  gateArgs: string[],
  request: unknown,
  timeoutMs: number,
  spawn: GateSpawn = nodeSpawn
): Promise<GateCall> {
  const label = [invocation.command, ...invocation.args, ...gateArgs].join(" ");
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: number | undefined;
    const finish = (call: GateCall) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(call);
    };

    let child: GateChild;
    try {
      child = spawn(invocation.command, [...invocation.args, ...gateArgs], { env: gateEnv() });
    } catch (err) {
      resolve({ exitCode: null, problem: `Not startable (${label}): ${errorText(err)}` });
      return;
    }
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => {
      if (stderr.length < 4000) stderr += chunk;
    });
    timer = window.setTimeout(() => {
      child.kill();
      finish({ exitCode: null, problem: `Timeout after ${Math.round(timeoutMs / 1000)}s: ${label}` });
    }, timeoutMs);
    child.on("error", (err: Error) => finish({ exitCode: null, problem: `Not startable (${label}): ${err.message}` }));
    child.on("close", (code: number | null) => {
      let result: GateCall["result"];
      try {
        const parsed: unknown = JSON.parse(stdout);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) result = parsed;
      } catch {
        result = undefined;
      }
      const problem = result ? undefined : stderr.trim().split("\n").pop() || `${label}: exit code ${code}, no JSON result`;
      finish({ exitCode: code, result, problem });
    });
    child.stdin?.on("error", () => undefined);
    child.stdin?.end(request === undefined ? "" : JSON.stringify(request));
  });
}

export interface GateProbeResult {
  ok: boolean;
  message: string;
}

/** Whether `jovian gate --version` answers with protocol 1 (contract §2); otherwise the reason. */
export async function probeGate(
  jovianCommand: string,
  timeoutMs: number = JOVIAN_GATE_PROBE_TIMEOUT_MS,
  spawn: GateSpawn = nodeSpawn
): Promise<GateProbeResult> {
  let invocation: GateInvocation;
  try {
    invocation = resolveGateInvocation(jovianCommand);
  } catch (err) {
    return { ok: false, message: errorText(err) };
  }
  const call = await runGate(invocation, ["--version"], undefined, timeoutMs, spawn);
  const protocol = call.result?.data?.protocol;
  if (call.exitCode === 0 && call.result?.outcome === "ok" && Array.isArray(protocol) && protocol.includes(1)) {
    return { ok: true, message: `Jovian gate ${textField(call.result.data?.jovian)}`.trim() };
  }
  return { ok: false, message: call.problem ?? "jovian gate does not support protocol 1" };
}

/** A string field of a gate result, or "" when it is missing or not a string. */
export function textField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface NodeRuntime {
  require?: (id: string) => unknown;
  process?: { env: Record<string, string | undefined> };
}

/** Obsidian's desktop window carries Node's `require` and `process`; outside it (tests) there is no runtime. */
function runtime(): NodeRuntime {
  const host: NodeRuntime | undefined = typeof window === "undefined" ? undefined : window;
  return host ?? {};
}

function processEnv(): Record<string, string | undefined> {
  return runtime().process?.env ?? {};
}

function homeDir(): string {
  const env = processEnv();
  return env.HOME || env.USERPROFILE || "";
}

/** Node's spawn from Obsidian's desktop runtime; throws (caught by runGate) where no Node runtime exists. */
const nodeSpawn: GateSpawn = (command, args, options) => {
  const load = runtime().require;
  if (!load) throw new Error("No Node.js runtime (desktop only)");
  const childProcess = load("child_process") as { spawn: (c: string, a: string[], o: object) => GateChild };
  return childProcess.spawn(command, args, { env: options.env, stdio: ["pipe", "pipe", "pipe"] });
};
