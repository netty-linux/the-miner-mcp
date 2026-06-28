import type { Request, Response, NextFunction } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { env } from "./config/env.js";
import {
  isRedditApiConfigured,
  isRedditRefreshConfigured,
  searchRedditPosts,
} from "./lib/reddit-client.js";
import { createMinerServer, SERVER_NAME } from "./server.js";
import { closeBrowser } from "./lib/scraping.js";
import { logger } from "./lib/logger.js";

const MCP_ENDPOINT = "/mcp";

function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!env.mcpAuthToken) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : (req.headers["x-mcp-token"] as string | undefined);

  if (token !== env.mcpAuthToken) {
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized — invalid or missing MCP auth token" },
      id: null,
    });
    return;
  }
  next();
}

const app = createMcpExpressApp({ host: env.host });

app.get("/health", async (_req, res) => {
  let reddit: {
    configured: boolean;
    refreshMode: boolean;
    via: "oauth" | "public" | "none";
  } = {
    configured: false,
    refreshMode: false,
    via: "none",
  };

  if (isRedditApiConfigured()) {
    reddit = {
      configured: true,
      refreshMode: isRedditRefreshConfigured(),
      via: (await searchRedditPosts("fitness", 1)).via,
    };
  }

  res.json({
    status: "ok",
    server: SERVER_NAME,
    version: "1.0.0",
    endpoint: MCP_ENDPOINT,
    reddit,
  });
});

app.post(MCP_ENDPOINT, optionalAuthMiddleware, async (req: Request, res: Response) => {
  const server = createMinerServer();
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    logger.error("MCP request handling failed", { error: String(error) });
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get(MCP_ENDPOINT, (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed. Use POST for MCP requests." },
    id: null,
  });
});

app.delete(MCP_ENDPOINT, (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null,
  });
});

const port = env.port;

const httpServer = app.listen(port, env.host, () => {
  logger.info(`${SERVER_NAME} listening on http://${env.host}:${port}`);
  logger.info(`MCP endpoint: http://${env.host}:${port}${MCP_ENDPOINT}`);
  logger.info(`Health check: http://${env.host}:${port}/health`);
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down...`);
  await closeBrowser();
  httpServer.close(() => {
    logger.info("Server stopped");
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", { reason: String(reason) });
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", { error: String(error) });
  process.exit(1);
});