import { logger } from "./logger.js";

const DEFAULT_TIMEOUT_MS = 30_000;

export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (compatible; TheMinerMCP/1.0; +https://github.com/the-miner-mcp)";

export interface FetchOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
  browserLike?: boolean;
}

export async function fetchWithTimeout(
  url: string,
  options: FetchOptions = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {}, method = "GET", body, browserLike = false } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      body,
      signal: controller.signal,
      headers: {
        "User-Agent": browserLike ? BROWSER_USER_AGENT : DEFAULT_USER_AGENT,
        Accept: browserLike ? "application/json, text/html, */*" : "application/json, text/html, */*",
        ...(browserLike ? { "Accept-Language": "en-US,en;q=0.9" } : {}),
        ...headers,
      },
    });
    return response;
  } catch (error) {
    logger.error("HTTP fetch failed", { url, error: String(error) });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(url: string, options?: FetchOptions): Promise<T> {
  const response = await fetchWithTimeout(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
}

export async function fetchText(url: string, options?: FetchOptions): Promise<string> {
  const response = await fetchWithTimeout(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}