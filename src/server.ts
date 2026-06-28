import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Implementation } from "@modelcontextprotocol/sdk/types.js";
import { buildServerIcons } from "./lib/server-icons.js";
import { registerTools } from "./tools/index.js";

export const SERVER_NAME = "The Miner MCP";
export const SERVER_VERSION = "1.0.0";

export const SERVER_INFO: Implementation = {
  name: "the-miner-mcp",
  title: "The Miner MCP",
  version: SERVER_VERSION,
  description:
    "MCP de mineração de ofertas. Para relatórios completos use analyze_niche_full (1 chamada). Tools individuais: trending, Facebook, YouTube, SEO, TikTok, landing page, competitor.",
  websiteUrl: "https://github.com/netty-linux/the-miner-mcp",
  icons: buildServerIcons(),
};

/**
 * Creates a fresh McpServer for each stateless HTTP request.
 * Matches SDK simpleStatelessStreamableHttp pattern — caller must server.close() after transport closes.
 */
export function createMinerServer(): McpServer {
  const server = new McpServer(
    SERVER_INFO,
    {
      capabilities: {
        logging: {},
      },
    },
  );
  registerTools(server);
  return server;
}