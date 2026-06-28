export interface ParsedFacebookAd {
  id: string;
  pageName: string;
  adCreativeBody: string;
  adDeliveryStartTime?: string;
  platforms: string[];
}

function unescapeJsonString(value: string): string {
  return value
    .replace(/\\u0026/g, "&")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function extractPlatforms(window: string): string[] {
  const platforms: string[] = [];
  const match = window.match(/"publisher_platforms":\[([^\]]*)\]/);
  if (!match) return ["facebook", "instagram"];

  const items = match[1]!.match(/"([^"]+)"/g) ?? [];
  for (const item of items) {
    const p = item.replace(/"/g, "");
    if (p) platforms.push(p);
  }
  return platforms.length > 0 ? platforms : ["facebook", "instagram"];
}

function extractCreativeBodies(window: string): string {
  const bodies: string[] = [];
  const arrayMatch = window.match(/"ad_creative_bodies":\[([^\]]*)\]/);
  if (arrayMatch) {
    const items = arrayMatch[1]!.match(/"((?:[^"\\]|\\.)*)"/g) ?? [];
    for (const item of items) {
      const text = unescapeJsonString(item.slice(1, -1));
      if (text) bodies.push(text);
    }
  }

  if (bodies.length === 0) {
    const single = window.match(/"ad_creative_bodies":\["((?:[^"\\]|\\.)*)"/)?.[1];
    if (single) bodies.push(unescapeJsonString(single));
  }

  return bodies.join(" ").slice(0, 500);
}

/**
 * Parse Facebook Ad Library HTML by extracting atomic ad objects.
 * Each ad is parsed from a local window around its ad_archive_id — never zip parallel arrays.
 */
export function parseFacebookAdLibraryHtml(html: string): ParsedFacebookAd[] {
  const ads: ParsedFacebookAd[] = [];
  const seen = new Set<string>();

  const idMatches = [...html.matchAll(/"ad_archive_id":"(\d+)"/g)];

  for (const match of idMatches) {
    const id = match[1]!;
    if (seen.has(id)) continue;

    const pos = match.index ?? 0;
    // Search forward from ad_archive_id only — avoids picking unrelated page_name from prior ads
    const window = html.slice(pos, pos + 6000);

    const pageName =
      window.match(/"page_name":"((?:[^"\\]|\\.)*)"/)?.[1]
        ?? window.match(/"pageName":"((?:[^"\\]|\\.)*)"/)?.[1]
        ?? "";

    if (!pageName) continue;

    const adCreativeBody = extractCreativeBodies(window);
    const adDeliveryStartTime =
      window.match(/"ad_delivery_start_time":"([^"]+)"/)?.[1]
      ?? window.match(/"start_date":"([^"]+)"/)?.[1];

    seen.add(id);
    ads.push({
      id,
      pageName: unescapeJsonString(pageName),
      adCreativeBody,
      adDeliveryStartTime,
      platforms: extractPlatforms(window),
    });
  }

  return ads.slice(0, 25);
}