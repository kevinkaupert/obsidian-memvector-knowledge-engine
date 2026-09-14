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
 * Usage: node mock-echo-server.js [port] [logFile]
 *   node testing/mock-echo-server.js 8092
 *   node testing/mock-echo-server.js 8092 /tmp/mock.log
 */
const http = require("http");
const fs = require("fs");

const port = Number(process.argv[2]) || 8092;
const logFile = process.argv[3];

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
      res.end(JSON.stringify({ data: [{ id: "mock-model" }] }));
      return;
    }

    if (req.url.includes("/embeddings")) {
      let text = "x";
      try {
        text = JSON.parse(body).input || text;
      } catch {
        /* keep default */
      }
      res.end(JSON.stringify({ data: [{ embedding: fakeEmbedding(text) }] }));
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
    res.end(JSON.stringify({ choices: [{ message: { content: prompt } }] }));
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`mock-echo-server listening on http://localhost:${port}` + (logFile ? `, logging to ${logFile}` : ""));
});
