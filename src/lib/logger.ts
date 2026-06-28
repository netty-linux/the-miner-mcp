type LogLevel = "debug" | "info" | "warn" | "error";

const PREFIX = "[The Miner MCP]";

function format(level: LogLevel, message: string, meta?: unknown): string {
  const ts = new Date().toISOString();
  const base = `${ts} ${PREFIX} [${level.toUpperCase()}] ${message}`;
  if (meta !== undefined) {
    return `${base} ${JSON.stringify(meta)}`;
  }
  return base;
}

export const logger = {
  debug(message: string, meta?: unknown): void {
    if (process.env.NODE_ENV !== "production") {
      console.debug(format("debug", message, meta));
    }
  },
  info(message: string, meta?: unknown): void {
    console.info(format("info", message, meta));
  },
  warn(message: string, meta?: unknown): void {
    console.warn(format("warn", message, meta));
  },
  error(message: string, meta?: unknown): void {
    console.error(format("error", message, meta));
  },
};