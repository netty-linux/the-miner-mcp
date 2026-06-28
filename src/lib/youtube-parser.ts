/** Junk titles/channels that appear in YouTube search page UI, not real videos. */
const JUNK_TITLE_PATTERNS = [
  /^search filters?$/i,
  /^filters?$/i,
  /^sort by$/i,
  /^upload date$/i,
  /^all$/i,
  /^today$/i,
  /^this week$/i,
  /^this month$/i,
  /^this year$/i,
  /^people also watched$/i,
  /^you may also like$/i,
  /^shorts$/i,
  /^mixes$/i,
  /^channels?$/i,
  /^playlists?$/i,
];

export interface ParsedYouTubeVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  viewCount: number | null;
  viewCountText: string | null;
}

export function isValidVideoTitle(title: string): boolean {
  if (!title || title.length < 4) return false;
  if (JUNK_TITLE_PATTERNS.some((p) => p.test(title.trim()))) return false;
  return true;
}

export function parseViewCount(text: string): number {
  const cleaned = text.replace(/[^0-9.KMBkmb]/g, "");
  if (/M/i.test(cleaned)) return Math.round(parseFloat(cleaned) * 1_000_000);
  if (/K/i.test(cleaned)) return Math.round(parseFloat(cleaned) * 1_000);
  return parseInt(cleaned, 10) || 0;
}

/**
 * Extract videos from YouTube search page by parsing ytInitialData JSON
 * and walking videoRenderer objects atomically (id + title + views aligned).
 */
export function parseYouTubeSearchHtml(html: string): ParsedYouTubeVideo[] {
  const videos: ParsedYouTubeVideo[] = [];
  const seen = new Set<string>();

  const ytJson = extractYtInitialDataJson(html);
  if (ytJson) {
    try {
      const data = JSON.parse(ytJson) as unknown;
      collectVideoRenderers(data, videos, seen);
    } catch {
      // fall through to block regex
    }
  }

  if (videos.length === 0) {
    collectFromVideoRendererBlocks(html, videos, seen);
  }

  return videos;
}

function collectVideoRenderers(node: unknown, out: ParsedYouTubeVideo[], seen: Set<string>): void {
  if (!node || typeof node !== "object") return;

  if (Array.isArray(node)) {
    for (const item of node) collectVideoRenderers(item, out, seen);
    return;
  }

  const obj = node as Record<string, unknown>;

  if (obj.videoRenderer && typeof obj.videoRenderer === "object") {
    const v = extractFromRenderer(obj.videoRenderer as Record<string, unknown>);
    if (v && !seen.has(v.videoId)) {
      seen.add(v.videoId);
      out.push(v);
    }
  }

  for (const value of Object.values(obj)) {
    collectVideoRenderers(value, out, seen);
  }
}

function extractFromRenderer(r: Record<string, unknown>): ParsedYouTubeVideo | null {
  const videoId = r.videoId as string | undefined;
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;

  const title = extractText(r.title);
  if (!isValidVideoTitle(title)) return null;

  const channelTitle =
    extractText(r.ownerText)
    || extractText(r.longBylineText)
    || extractText(r.shortBylineText)
    || "Unknown";
  const viewCountText = extractSimpleText(r.viewCountText);
  const viewCount = viewCountText ? parseViewCount(viewCountText) : null;

  return { videoId, title, channelTitle, viewCount, viewCountText };
}

function extractText(field: unknown): string {
  if (!field || typeof field !== "object") return "";
  const obj = field as Record<string, unknown>;
  if (typeof obj.simpleText === "string") return obj.simpleText;
  const runs = obj.runs as Array<{ text?: string }> | undefined;
  if (runs?.[0]?.text) return runs[0].text;
  return "";
}

function extractSimpleText(field: unknown): string | null {
  if (!field || typeof field !== "object") return null;
  const obj = field as Record<string, unknown>;
  if (typeof obj.simpleText === "string") return obj.simpleText;
  const runs = obj.runs as Array<{ text?: string }> | undefined;
  if (runs?.[0]?.text) return runs[0].text;
  return null;
}

function extractYtInitialDataJson(html: string): string | null {
  const marker = "var ytInitialData";
  const startIdx = html.indexOf(marker);
  if (startIdx === -1) return null;

  const braceStart = html.indexOf("{", startIdx);
  if (braceStart === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = braceStart; i < html.length; i++) {
    const ch = html[i]!;
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return html.slice(braceStart, i + 1);
    }
  }
  return null;
}

/** Fallback: for each videoId inside a videoRenderer context, extract fields from a local window. */
function collectFromVideoRendererBlocks(
  html: string,
  out: ParsedYouTubeVideo[],
  seen: Set<string>,
): void {
  const idMatches = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)];

  for (const match of idMatches) {
    const videoId = match[1]!;
    if (seen.has(videoId)) continue;

    const pos = match.index ?? 0;
    const before = html.slice(Math.max(0, pos - 300), pos);
    if (!before.includes("videoRenderer")) continue;

    const window = html.slice(Math.max(0, pos - 200), pos + 4000);

    const title =
      window.match(/"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/)?.[1]
        ?.replace(/\\u0026/g, "&")
        .replace(/\\"/g, '"') ?? "";
    if (!isValidVideoTitle(title)) continue;

    const viewCountText = window.match(/"viewCountText":\{"simpleText":"([^"]+)"/)?.[1] ?? null;
    const channelTitle =
      window.match(/"ownerText":\{"runs":\[\{"text":"([^"]+)"/)?.[1]
      ?? window.match(/"longBylineText":\{"runs":\[\{"text":"([^"]+)"/)?.[1]
      ?? window.match(/"shortBylineText":\{"runs":\[\{"text":"([^"]+)"/)?.[1]
      ?? "Unknown";

    seen.add(videoId);
    out.push({
      videoId,
      title,
      channelTitle,
      viewCount: viewCountText ? parseViewCount(viewCountText) : null,
      viewCountText,
    });
  }
}