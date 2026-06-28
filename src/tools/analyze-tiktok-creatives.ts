import { z } from "zod";
import { env } from "../config/env.js";
import { fetchText } from "../lib/http.js";
import { buildSourceStatus } from "../lib/data-availability.js";
import { logger } from "../lib/logger.js";
import { toolSuccessResult } from "../lib/errors.js";

export const analyzeTiktokCreativesSchema = z.object({
  keyword: z.string().describe("Keyword or product to search in TikTok creatives"),
  country: z.string().optional().default("US").describe("Target country code"),
  industry: z.string().optional().describe("Industry category filter"),
});

export type AnalyzeTiktokCreativesInput = z.infer<typeof analyzeTiktokCreativesSchema>;

interface TikTokCreative {
  title: string;
  hook: string;
  format: string;
  source: string;
  metricsAvailable: boolean;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
}

async function searchTikTokCreativeCenter(
  keyword: string,
  country: string,
): Promise<{ creatives: TikTokCreative[]; status: ReturnType<typeof buildSourceStatus> }> {
  const creatives: TikTokCreative[] = [];
  try {
    const url = `https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en?region=${country}&keyword=${encodeURIComponent(keyword)}`;
    const html = await fetchText(url, { browserLike: true });

    const blocks = [...html.matchAll(
      /"ad_title":"([^"]*)".*?"ad_description":"([^"]*)"(?:.*?"like_count":(\d+))?(?:.*?"comment_count":(\d+))?(?:.*?"share_count":(\d+))?/gs,
    )];

    for (const match of blocks.slice(0, 10)) {
      const title = match[1] ?? "";
      const desc = match[2] ?? "";
      const hook = desc.split(/[.!?]/)[0]?.trim() ?? title;
      const likeCount = match[3] ? parseInt(match[3], 10) : undefined;
      const commentCount = match[4] ? parseInt(match[4], 10) : undefined;
      const shareCount = match[5] ? parseInt(match[5], 10) : undefined;

      creatives.push({
        title: title.slice(0, 150),
        hook: hook.slice(0, 200),
        format: detectFormat(desc),
        source: "tiktok_creative_center",
        metricsAvailable: likeCount !== undefined,
        likeCount,
        commentCount,
        shareCount,
      });
    }

    if (creatives.length === 0) {
      const titleMatches = html.match(/"ad_title":"([^"]+)"/g) ?? [];
      const descMatches = html.match(/"ad_description":"([^"]+)"/g) ?? [];
      const count = Math.min(titleMatches.length, descMatches.length, 10);
      for (let i = 0; i < count; i++) {
        const title = titleMatches[i]?.match(/"ad_title":"([^"]+)"/)?.[1] ?? "";
        const desc = descMatches[i]?.match(/"ad_description":"([^"]+)"/)?.[1] ?? "";
        creatives.push({
          title: title.slice(0, 150),
          hook: (desc.split(/[.!?]/)[0]?.trim() ?? title).slice(0, 200),
          format: detectFormat(desc),
          source: "tiktok_creative_center",
          metricsAvailable: false,
        });
      }
    }
  } catch (error) {
    logger.warn("TikTok Creative Center fetch failed", { error: String(error) });
    return { creatives: [], status: buildSourceStatus("tiktok_creative_center", 0, String(error)) };
  }

  return { creatives, status: buildSourceStatus("tiktok_creative_center", creatives.length) };
}

function detectFormat(text: string): string {
  if (/before.*after|transform/i.test(text)) return "before-after";
  if (/POV|pov/i.test(text)) return "POV";
  if (/review|honest/i.test(text)) return "review";
  if (/unboxing/i.test(text)) return "unboxing";
  if (/tutorial|how to/i.test(text)) return "tutorial";
  return "UGC";
}

export async function analyzeTiktokCreatives(args: AnalyzeTiktokCreativesInput) {
  const { keyword, country = "US", industry } = args;
  logger.info("Analyzing TikTok creatives", { keyword, country, industry });

  const { creatives, status } = await searchTikTokCreativeCenter(keyword, country);

  const withMetrics = creatives.filter((c) => c.metricsAvailable);
  const avgLikes =
    withMetrics.length > 0
      ? Math.round(withMetrics.reduce((s, c) => s + (c.likeCount ?? 0), 0) / withMetrics.length)
      : null;

  const topHooks = creatives.slice(0, 5).map((c) => c.hook);
  const formats = [...new Set(creatives.map((c) => c.format))];

  const result = {
    query: { keyword, country, industry },
    dataSource: "tiktok_creative_center",
    dataAvailability: creatives.length > 0 ? (withMetrics.length > 0 ? "available" : "partial") : "unavailable",
    source: status,
    apiKeyUsed: Boolean(env.tiktokAccessToken),
    totalFound: creatives.length,
    avgLikes,
    scalingSignal:
      creatives.length === 0
        ? "UNAVAILABLE — TikTok Creative Center blocked or no matches"
        : creatives.length >= 5
          ? "MODERATE — multiple creatives found (verify metrics manually)"
          : creatives.length >= 1
            ? "LOW — limited creative data"
            : "NONE",
    topCreatives: creatives.slice(0, 8),
    topHooks,
    popularFormats: formats,
    recommendations: [
      creatives.length > 0
        ? `Found ${creatives.length} real creatives — study ${formats[0] ?? "UGC"} format hooks`
        : "No creatives retrieved — TikTok may block automated access. Set TIKTOK_ACCESS_TOKEN or browse Creative Center manually.",
      withMetrics.length === 0
        ? "Engagement metrics not exposed in page — do not infer performance without real counts."
        : `Average likes on sampled creatives: ${avgLikes}`,
    ],
    analyzedAt: new Date().toISOString(),
  };

  return toolSuccessResult(result);
}