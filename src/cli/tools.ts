/**
 * Purpose: `memvector tools --json` (knowOS ADR-0014 §2, Plan 0017): the commands MemVector offers to agents (an MCP
 * server, Cortex), with call fields, a description for the model and JSON schemas for input and output.
 * Architecture: A caller builds its tools only from this list. `argv` follows `cli.js`; the caller adds
 * `--vault <vault>`; `args` maps an input property to its flag (an array property gives the flag once per item).
 * Listed commands answer with the envelope `{"v": 1, "outcome": "ok", "data": ...}` or `{"v": 1, "outcome": "error", "error": {"code", "message"}}`.
 */

type Schema = Record<string, unknown>;

export interface AgentTool {
  /** A write tool that answers `"preview": true` with a preview instead of writing (knowOS ADR-0014 §3). */
  preview?: boolean;
  name: string;
  argv: string[];
  /** Positional target input property or properties, placed after argv (ADR-0017 §1, §7). */
  positional?: string | string[];
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
    argv: ["note", "search", "--json"],
    positional: ["query"],
    args: { limit: "--limit", folder: "--folder", type: "--type" },
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
        type: { type: "string", description: "only notes with this frontmatter type, e.g. definition or hub" },
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
    argv: ["note", "read", "--neighbors", "--json"],
    positional: ["note"],
    args: { limit: "--limit" },
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
  {
    name: "context",
    argv: ["note", "read", "--context", "--json"],
    positional: ["seeds"],
    args: {},
    stdin: false,
    effect: "read",
    description:
      "Assemble the context MemVector's synthesis would use around notes the user named: notes close in meaning to " +
      "them (vector) and notes linked to them up to the configured hop depth (graph), each with its text, plus the " +
      "typed relations among them. Call it only with notes the user named as [[Note]] in the chat; when a search hit " +
      "looks like a good starting point, ask the user before using it as a seed. Limits come from MemVector's " +
      "settings. channels says whether each retrieval leg was ready, unindexed or failed.",
    input: {
      type: "object",
      additionalProperties: false,
      required: ["seeds"],
      properties: {
        seeds: {
          type: "array",
          minItems: 1,
          items: { type: "string" },
          description: "vault-relative paths of the notes the user named, e.g. [\"concepts/Basis.md\"]",
        },
      },
    },
    output: envelopeSchema({
      type: "object",
      required: ["parameters", "index", "seeds", "channels", "hits", "relations"],
      properties: {
        parameters: { type: "object", description: "each limit used, with its value and source (settings)" },
        index: {
          type: "object",
          required: ["model", "fingerprint", "indexed"],
          properties: { model: { type: "string" }, fingerprint: { type: "string" }, indexed: { type: "integer" } },
        },
        seeds: {
          type: "array",
          items: { type: "object", required: ["path", "title"], properties: { path: { type: "string" }, title: { type: "string" } } },
        },
        channels: {
          type: "object",
          required: ["vector", "graph"],
          properties: { vector: { enum: ["ready", "unindexed", "error"] }, graph: { enum: ["ready", "unindexed", "error"] } },
        },
        hits: {
          type: "array",
          items: {
            type: "object",
            required: ["path", "title", "origin", "hops", "similarity", "excerpt"],
            properties: {
              path: { type: "string" },
              title: { type: "string" },
              origin: { enum: ["both", "vector", "graph"] },
              hops: { type: ["integer", "null"] },
              similarity: { type: ["number", "null"] },
              excerpt: { type: "string", description: "the note's text, cut at the synthesis content cap (0 = whole)" },
            },
          },
        },
        relations: {
          type: "array",
          items: {
            type: "object",
            required: ["from", "to", "type", "description"],
            properties: { from: { type: "string" }, to: { type: "string" }, type: { type: "string" }, description: { type: "string" } },
          },
        },
      },
    }),
  },
  {
    name: "relation.add",
    argv: ["relation", "create", "--json"],
    args: {},
    stdin: true,
    effect: "write",
    preview: true,
    description:
      "Create the relation note for one typed relation between two existing notes (e.g. from REQUIRES to), with your " +
      "reasoning as its text, so it appears in the vault's knowledge graph. An existing relation note for the same pair " +
      "and type is answered with its path. It writes nothing: the answer is a preview with a preview_id. Show it to the " +
      "user; only when they confirm, call jovian_change_apply with that preview_id.",
    input: {
      type: "object",
      additionalProperties: false,
      required: ["from", "to", "relation"],
      properties: {
        from: { type: "string", description: "vault-relative path of the source note" },
        to: { type: "string", description: "vault-relative path of the target note" },
        relation: { type: "string", description: "relation label, e.g. REQUIRES, IMPLIES, EXAMPLE_OF" },
        text: { type: "string", description: "why the relation holds, in the user's words or yours" },
      },
    },
    output: envelopeSchema({
      type: "object",
      required: ["path", "created"],
      properties: { path: { type: "string" }, created: { type: "boolean" }, preview: { type: "object" } },
    }),
  },
];

/** The `tools --json` result: MemVector's version and its agent tools. */
export function toolList(version: string): Schema {
  return { v: 1, outcome: "ok", data: { component: "memvector", version, tools: TOOLS } };
}
