import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function parseToolData<T = Record<string, unknown>>(result: CallToolResult): T {
  const jsonBlock = result.content.find(
    (c): c is { type: "text"; text: string } => c.type === "text" && "text" in c && c.text.includes('"success"'),
  );
  const parsed = JSON.parse(jsonBlock?.text ?? "{}") as { success: boolean; data: T };
  if (!parsed.success) {
    throw new Error("Tool returned success:false");
  }
  return parsed.data;
}