import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export class MinerToolError extends Error {
  constructor(
    message: string,
    public readonly code: string = "TOOL_ERROR",
    public readonly recoverable = true,
  ) {
    super(message);
    this.name = "MinerToolError";
  }
}

export class MissingApiKeyError extends MinerToolError {
  constructor(service: string, envVar: string) {
    super(
      `${service} requires API key. Set ${envVar} in your environment. Falling back to public data where possible.`,
      "MISSING_API_KEY",
    );
  }
}

export function toolErrorResult(error: unknown): CallToolResult {
  const message =
    error instanceof MinerToolError
      ? error.message
      : error instanceof Error
        ? error.message
        : "An unexpected error occurred";

  return {
    content: [{ type: "text", text: JSON.stringify({ success: false, error: message }, null, 2) }],
    isError: true,
  };
}

export function toolSuccessResult<T>(data: T): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ success: true, data }, null, 2) }],
  };
}