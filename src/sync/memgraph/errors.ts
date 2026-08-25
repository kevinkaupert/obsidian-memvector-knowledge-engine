export type MemgraphErrorKind = "connection" | "auth" | "protocol" | "query" | "unknown";

export class MemgraphError extends Error {
  readonly kind: MemgraphErrorKind;

  constructor(kind: MemgraphErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = "MemgraphError";
  }
}

/** Maps a neo4j-driver-lite error (or anything else thrown) to a typed, user-presentable MemgraphError. */
export function toMemgraphError(err: unknown): MemgraphError {
  if (err instanceof MemgraphError) return err;

  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code || "";
  const lower = message.toLowerCase();

  if (code.includes("Unauthorized") || lower.includes("authentication") || lower.includes("unauthorized")) {
    return new MemgraphError("auth", `Memgraph-Anmeldung fehlgeschlagen: ${message}`);
  }
  if (
    lower.includes("econnrefused") ||
    lower.includes("failed to connect") ||
    lower.includes("could not perform discovery") ||
    lower.includes("timeout")
  ) {
    return new MemgraphError("connection", `Keine Verbindung zu Memgraph möglich: ${message}`);
  }
  if (lower.includes("protocol") || lower.includes("handshake")) {
    return new MemgraphError("protocol", `Bolt-Protokollfehler: ${message}`);
  }
  if (code.startsWith("Neo.ClientError") || code.startsWith("Memgraph.ClientError")) {
    return new MemgraphError("query", `Cypher-Fehler: ${message}`);
  }
  return new MemgraphError("unknown", message);
}
