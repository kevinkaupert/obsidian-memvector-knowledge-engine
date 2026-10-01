#!/usr/bin/env node
/**
 * Standalone mock LLM/embedding endpoint for docs/TESTING.md's local SQLite
 * smoke test - no dependencies beyond Node's own `http` module. Point the
 * plugin's "Custom REST Endpoint" (LLM) and/or embedding provider base URL
 * at this server (e.g. http://localhost:8092/v1) to run indexing and
 * synthesis without a real Ollama/cloud provider.
 *
 * - GET  .../models         -> a single fake model, so "connection test" buttons succeed.
 * - POST .../embeddings     -> a short deterministic fake vector per request (stable per input text).
 * - POST .../chat/completions -> echoes the exact received user-role prompt back as the
 *   assistant's reply, so the synthesis result modal shows the real outgoing prompt directly -
 *   the point is to *read* what the plugin sent, not to get a real answer.
 *
 * Every request is also logged to stdout (and, if given, to a log file) as
 * timestamp + method + path + body, for scripted verification.
 *
 * Usage: node mock-echo-server.js [port] [logFile] [--delay ms]
 *   node testing/mock-echo-server.js 8092
 *   node testing/mock-echo-server.js 8092 /tmp/mock.log
 *   node testing/mock-echo-server.js 8092 --delay 300
 *
 * --delay holds every embedding and chat response for the given number of milliseconds (the models list stays
 * immediate, so connection tests are not slowed down). This makes a vector calculation slow enough to change
 * settings while it runs, e.g. to check that switching the embedding model mid-run cancels it.
 */
const http = require("http");
const fs = require("fs");

const args = process.argv.slice(2);
const delayIndex = args.indexOf("--delay");
const delayMs = delayIndex === -1 ? 0 : Number(args[delayIndex + 1]);
if (delayIndex !== -1 && (!Number.isFinite(delayMs) || delayMs < 0)) {
  console.error("--delay expects a non-negative number of milliseconds, e.g. --delay 300");
  process.exit(1);
}
const positional = delayIndex === -1 ? args : args.filter((_arg, i) => i !== delayIndex && i !== delayIndex + 1);
const port = Number(positional[0]) || 8092;
const logFile = positional[1];

/** Sends a JSON response, after the configured delay unless `immediate`. */
function respond(res, payload, immediate = false) {
  const send = () => res.end(JSON.stringify(payload));
  if (immediate || delayMs === 0) send();
  else setTimeout(send, delayMs);
}

function fakeEmbedding(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  const vec = [];
  for (let i = 0; i < 8; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    vec.push(((h % 2000) - 1000) / 1000);
  }
  return vec;
}

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const line = `${new Date().toISOString()} ${req.method} ${req.url}\nBODY: ${body}\n---\n`;
    process.stdout.write(line);
    if (logFile) fs.appendFileSync(logFile, line);

    res.writeHead(200, { "Content-Type": "application/json" });

    if (req.url.includes("/models")) {
      respond(res, { data: [{ id: "mock-model" }] }, true);
      return;
    }

    if (req.url.includes("/embeddings")) {
      let text = "x";
      try {
        text = JSON.parse(body).input || text;
      } catch {
        /* keep default */
      }
      respond(res, { data: [{ embedding: fakeEmbedding(text) }] });
      return;
    }

    // Chat completions (or anything else): echo the user prompt back.
    let prompt = "(no prompt found in request body)";
    try {
      const parsed = JSON.parse(body);
      const userMsg = (parsed.messages || []).find((m) => m.role === "user");
      if (userMsg) prompt = userMsg.content;
    } catch {
      /* keep default */
    }
    respond(res, { choices: [{ message: { content: prompt } }] });
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(
    `mock-echo-server listening on http://localhost:${port}` +
      (logFile ? `, logging to ${logFile}` : "") +
      (delayMs > 0 ? `, delaying embedding and chat responses by ${delayMs} ms` : "")
  );
});
