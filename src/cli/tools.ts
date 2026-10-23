/**
 * Purpose: `memvector tools --json` (knowOS ADR-0014 §2, Plan 0017): the commands MemVector offers to agents (an MCP
 * server, Cortex), with call fields, a description for the model and JSON schemas for input and output.
 * Architecture: A caller builds its tools only from this list. `argv` follows `cli.js`; the caller adds
 * `--vault <vault>`; `args` maps an input property to its flag. Listed commands answer with the envelope
 * `{"v": 1, "outcome": "ok", "data": ...}` or `{"v": 1, "outcome": "error", "error": {"code", "message"}}`.
 */

type Schema = Record<string, unknown>;

export interface AgentTool {
  name: string;
  argv: string[];
  args: Record<string, string>;
  stdin: boolean;
  effect: "read" | "write";
  description: string;
  input: Schema;
  output: Schema;
}

const ERROR: Schema = {
  type: "object",
  required: ["v", "outcome", "error"],
  properties: {
    v: { const: 1 },
    outcome: { const: "error" },
    error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" } } },
  },
};

/** The output schema of a command: the ok envelope around `data`, or the error envelope. */
export function envelopeSchema(data: Schema): Schema {
  return {
    oneOf: [
      { type: "object", required: ["v", "outcome", "data"], properties: { v: { const: 1 }, outcome: { const: "ok" }, data } },
      ERROR,
    ],
  };
}

export const TOOLS: AgentTool[] = [
  {
    name: "search",
    argv: ["search", "--json", "--envelope"],
    args: { query: "--query", limit: "--limit", folder: "--folder", type: "--type" },
    stdin: false,
    effect: "read",
    description:
      "Find the notes of the vault whose meaning is closest to a question or concept, with a score and the passage of " +
      "each note that matches best. Use it first for every question, so the answer rests on the vault: what the vault " +
      "says takes precedence over general knowledge.",
    input: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string", description: "the question or concept, in the words of the vault's language" },
        limit: { type: "integer", minimum: 1, description: "number of hits, default 20" },
        folder: { type: "string", description: "only notes below this vault-relative folder" },
        type: { type: "string", description: "only notes with this frontmatter type, e.g. concept" },
      },
    },
    output: envelopeSchema({
      type: "object",
      required: ["query", "model", "fingerprint", "indexed", "results"],
      properties: {
        query: { type: "string" },
        model: { type: "string" },
        fingerprint: { type: "string" },
        indexed: { type: "integer" },
        results: {
          type: "array",
          items: {
            type: "object",
            required: ["path", "title", "score", "excerpt"],
            properties: {
              path: { type: "string" },
              title: { type: "string" },
              score: { type: "number" },
              excerpt: { type: "string" },
            },
          },
        },
      },
    }),
  },
  {
    name: "graph.neighbors",
    argv: ["graph", "neighbors", "--json"],
    args: { note: "--note", limit: "--limit" },
    stdin: false,
    effect: "read",
    description:
      "List the relations of one note in the vault's knowledge graph: for each, the relation type (e.g. REQUIRES, " +
      "IMPLIES, EXAMPLE_OF), its direction and the other note. Use it to follow what a note depends on or leads to, " +
      "after search or note.read found the note.",
    input: {
      type: "object",
      additionalProperties: false,
      required: ["note"],
      properties: {
        note: { type: "string", description: "vault-relative path of the note, e.g. concepts/Vektorraum.md" },
        limit: { type: "integer", minimum: 1, description: "number of relations, default 100" },
      },
    },
    output: envelopeSchema({
      type: "object",
      required: ["note", "title", "neighbors", "truncated"],
      properties: {
        truncated: { type: "boolean" },
        note: { type: "string" },
        title: { type: "string" },
        neighbors: {
          type: "array",
          items: {
            type: "object",
            required: ["type", "direction", "bidirectional", "path", "title", "description"],
            properties: {
              type: { type: "string" },
              direction: { enum: ["out", "in"] },
              bidirectional: { type: "boolean" },
              path: { type: "string" },
              title: { type: "string" },
              description: { type: "string" },
            },
          },
        },
      },
    }),
  },
];

/** The `tools --json` result: MemVector's version and its agent tools. */
export function toolList(version: string): Schema {
  return { v: 1, outcome: "ok", data: { component: "memvector", version, tools: TOOLS } };
}
