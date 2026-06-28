import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools/index.js";

export const SERVER_NAME = "The Miner MCP";
export const SERVER_VERSION = "1.0.0";

/**
 * Creates a fresh McpServer for each stateless HTTP request.
 * Matches SDK simpleStatelessStreamableHttp pattern — caller must server.close() after transport closes.
 */
export function createMinerServer(): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        logging: {},
      },
    },
  );
  registerTools(server);
  return server;
}