import type { CallToolResult, ContentBlock } from "@modelcontextprotocol/sdk/types.js";
import { env } from "../config/env.js";

export interface ToolImage {
  data: string;
  mimeType: string;
  title?: string;
}

export interface RichToolResultOptions {
  visualMarkdown?: string;
  images?: ToolImage[];
  includeJson?: boolean;
  compactJson?: boolean;
}

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
  return toolRichResult(data);
}

export function toolRichResult<T>(data: T, options: RichToolResultOptions = {}): CallToolResult {
  const content: ContentBlock[] = [];
  const includeJson = options.includeJson ?? true;

  if (options.visualMarkdown) {
    content.push({ type: "text", text: options.visualMarkdown });
  }

  if (includeJson) {
    const indent = options.compactJson ? undefined : 2;
    content.push({
      type: "text",
      text: JSON.stringify({ success: true, data }, null, indent),
    });
  }

  const images = env.mcpLightResponse ? undefined : options.images;
  for (const image of images ?? []) {
    content.push({
      type: "image",
      data: image.data,
      mimeType: image.mimeType,
      annotations: image.title
        ? { audience: ["assistant", "user"], priority: 0.8 }
        : undefined,
      _meta: image.title ? { title: image.title } : undefined,
    });
  }

  const structuredContent =
    typeof data === "object" && data !== null ? (data as Record<string, unknown>) : { value: data };

  return { content, structuredContent };
}