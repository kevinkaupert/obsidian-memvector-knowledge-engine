import type { App } from "obsidian";
import type { MemVectorSettings } from "../../settings/types";
import { connect } from "./neo4jDriverAdapter";

/**
 * Real Bolt HELLO handshake (via the driver), replacing the old "test"
 * (main.js:1728-1769) that sent a plain HTTP GET to the raw Bolt port and
 * treated a malformed/binary response as proof the server was up - it
 * never actually distinguished a running Memgraph from a closed port.
 */
export async function testMemgraphConnection(app: App, settings: MemVectorSettings): Promise<void> {
  const connection = connect(app, settings);
  try {
    await connection.verifyConnectivity();
  } finally {
    await connection.close();
  }
}
