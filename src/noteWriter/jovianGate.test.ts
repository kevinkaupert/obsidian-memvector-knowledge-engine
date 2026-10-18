import { describe, expect, it, vi } from "vitest";
import { probeGate, resolveGateInvocation, runGate, splitCommandLine, type GateChild, type GateSpawn } from "./jovianGate";

// The gate runner uses window timers (Obsidian popout rule); Node tests have no window.
vi.stubGlobal("window", globalThis);

/** A fake gate process: answers with `stdout` and `code`, or never closes when `hang` is set. */
function fakeSpawn(answer: { stdout?: string; stderr?: string; code?: number; hang?: boolean; throws?: boolean }) {
  const calls: Array<{ command: string; args: string[]; stdin: string }> = [];
  const spawn: GateSpawn = (command, args) => {
    if (answer.throws) throw new Error("ENOENT");
    const handlers: Record<string, (value: never) => void> = {};
    const out: Record<string, (chunk: string) => void> = {};
    const err: Record<string, (chunk: string) => void> = {};
    const call = { command, args, stdin: "" };
    calls.push(call);
    const child: GateChild = {
      stdout: { setEncoding: () => undefined, on: (_e, cb) => { out.data = cb; } },
      stderr: { setEncoding: () => undefined, on: (_e, cb) => { err.data = cb; } },
      stdin: {
        on: () => undefined,
        end: (data: string) => {
          call.stdin = data;
          if (answer.hang) return;
          queueMicrotask(() => {
            if (answer.stdout) out.data?.(answer.stdout);
            if (answer.stderr) err.data?.(answer.stderr);
            handlers.close?.((answer.code ?? 0) as never);
          });
        },
      },
      on: (event: string, cb: (value: never) => void) => {
        handlers[event] = cb;
      },
      kill: () => undefined,
    } as GateChild;
    return child;
  };
  return { spawn, calls };
}

describe("gate invocation", () => {
  it("runs python3 -m jovian.gate without a configured command", () => {
    expect(resolveGateInvocation("")).toEqual({ command: "python3", args: ["-m", "jovian.gate"] });
  });

  it("appends gate to a configured command and expands ~", () => {
    expect(resolveGateInvocation("~/venv/bin/jovian", "/home/u")).toEqual({ command: "/home/u/venv/bin/jovian", args: ["gate"] });
    expect(resolveGateInvocation('"/my apps/python" -m jovian.cli')).toEqual({ command: "/my apps/python", args: ["-m", "jovian.cli", "gate"] });
  });

  it("rejects an unclosed quote", () => {
    expect(() => splitCommandLine('"/a b')).toThrow("Unclosed quote");
  });
});

describe("runGate", () => {
  const invocation = { command: "jovian", args: ["gate"] };

  it("sends the request as JSON on stdin and parses the result", async () => {
    const fake = fakeSpawn({ stdout: '{"v":1,"outcome":"ok","data":{"target":"a.md"}}' });
    const call = await runGate(invocation, ["write", "--vault", "/v", "--json"], { v: 1 }, 1000, fake.spawn);
    expect(call).toEqual({ exitCode: 0, result: { v: 1, outcome: "ok", data: { target: "a.md" } }, problem: undefined });
    expect(fake.calls[0]).toEqual({ command: "jovian", args: ["gate", "write", "--vault", "/v", "--json"], stdin: '{"v":1}' });
  });

  it("reports malformed output without a result", async () => {
    const call = await runGate(invocation, ["write"], {}, 1000, fakeSpawn({ stdout: "Traceback", stderr: "boom\nValueError: x", code: 1 }).spawn);
    expect(call.result).toBeUndefined();
    expect(call.problem).toBe("ValueError: x");
  });

  it("reports a timeout", async () => {
    const call = await runGate(invocation, ["write"], {}, 10, fakeSpawn({ hang: true }).spawn);
    expect(call.exitCode).toBeNull();
    expect(call.problem).toContain("Timeout");
  });

  it("reports a command that cannot start", async () => {
    const call = await runGate(invocation, ["write"], {}, 1000, fakeSpawn({ throws: true }).spawn);
    expect(call.problem).toContain("Not startable");
  });
});

describe("probeGate", () => {
  it("accepts protocol 1", async () => {
    const result = await probeGate("", 1000, fakeSpawn({ stdout: '{"v":1,"outcome":"ok","data":{"jovian":"0.25.6","protocol":[1]}}' }).spawn);
    expect(result).toEqual({ ok: true, message: "Jovian gate 0.25.6" });
  });

  it("refuses another protocol or a Jovian without the gate", async () => {
    expect((await probeGate("", 1000, fakeSpawn({ stdout: '{"v":1,"outcome":"ok","data":{"protocol":[2]}}' }).spawn)).ok).toBe(false);
    expect((await probeGate("", 1000, fakeSpawn({ stderr: "usage: jovian", code: 2 }).spawn)).ok).toBe(false);
  });
});
