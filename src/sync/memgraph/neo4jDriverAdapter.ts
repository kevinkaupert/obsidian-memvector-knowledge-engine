import type { App } from "obsidian";
import { auth, driver as createDriver, type Driver } from "neo4j-driver-lite";
import { getMemgraphPassword } from "../../settings/secrets";
import type { MemVectorSettings } from "../../settings/types";
import type { CypherStatement } from "./cypherBuilder";
import { toMemgraphError } from "./errors";

export interface MemgraphConnection {
  verifyConnectivity(): Promise<void>;
  runStatements(statements: CypherStatement[]): Promise<{ recordCount: number }>;
  /** Read query returning parsed row objects - runStatements only counts records, it doesn't hand them back. */
  query<T = Record<string, unknown>>(cypher: string, params?: Record<string, unknown>): Promise<T[]>;
  close(): Promise<void>;
}

function authTokenFor(app: App, settings: MemVectorSettings) {
  // neo4j-driver-lite's own type defs for auth.none() don't satisfy the
  // AuthToken shape the driver() function expects (missing `credentials`).
  // Empty-credential basic auth is functionally equivalent against a
  // Memgraph instance that doesn't have auth enabled, without fighting
  // that upstream type gap.
  return auth.basic(settings.memgraphUser || "", getMemgraphPassword(app));
}

/**
 * Thin adapter around neo4j-driver-lite (Memgraph documents Bolt-driver
 * compatibility with the standard Neo4j drivers). Replaces the entire
 * HTTP-based "sync" from main.js:1676-1726, which POSTed to
 * `/db/data/cypher` - an old, removed Neo4j REST endpoint Memgraph never
 * implemented - so it silently always failed and fell back to a clipboard
 * copy while still telling the user "✅ Synchronisiert!".
 */
export function connect(app: App, settings: MemVectorSettings): MemgraphConnection {
  const url = settings.memgraphUrl || "bolt://localhost:7687";
  let driverInstance: Driver;
  try {
    driverInstance = createDriver(url, authTokenFor(app, settings), { encrypted: false });
  } catch (err) {
    throw toMemgraphError(err);
  }

  return {
    async verifyConnectivity() {
      try {
        await driverInstance.verifyConnectivity();
      } catch (err) {
        throw toMemgraphError(err);
      }
    },

    async runStatements(statements) {
      const session = driverInstance.session();
      let recordCount = 0;
      try {
        for (const stmt of statements) {
          const result = await session.run(stmt.query, stmt.params);
          recordCount += result.records.length;
        }
      } catch (err) {
        throw toMemgraphError(err);
      } finally {
        await session.close();
      }
      return { recordCount };
    },

    async query<T = Record<string, unknown>>(cypher: string, params: Record<string, unknown> = {}) {
      const session = driverInstance.session();
      try {
        const result = await session.run(cypher, params);
        return result.records.map((record) => {
          const row: Record<string, unknown> = {};
          for (const key of record.keys) {
            row[key as string] = record.get(key);
          }
          return row as T;
        });
      } catch (err) {
        throw toMemgraphError(err);
      } finally {
        await session.close();
      }
    },

    async close() {
      await driverInstance.close();
    },
  };
}
