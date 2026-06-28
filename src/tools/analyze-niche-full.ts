import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { toolRichResult } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { parseToolData } from "../lib/tool-result.js";
import { synthesizeMiningReport, type MiningDataInput } from "../lib/report-synthesizer.js";
import {
  buildMiningReportCharts,
  buildMiningReportVisualMarkdown,
  svgToBase64,
} from "../lib/visualizations.js";
import { mineTrendingProducts } from "./mine-trending-products.js";
import { analyzeFacebookAds } from "./analyze-facebook-ads.js";
import { analyzeYoutubeTrends } from "./analyze-youtube-trends.js";
import { analyzeGoogleSeo } from "./analyze-google-seo.js";
import { analyzeTiktokCreatives } from "./analyze-tiktok-creatives.js";

export const analyzeNicheFullSchema = z.object({
  niche: z.string().describe("Niche or market to analyze (e.g. emagrecimento, fitness)"),
  country: z.string().optional().default("BR").describe("ISO country code"),
  time_period: z
    .enum(["last_7_days", "last_30_days", "last_90_days", "last_12_months"])
    .optional()
    .default("last_30_days")
    .describe("Trend window for trending products"),
  language: z.string().optional().describe("Language code for SEO (defaults by country)"),
  include_charts: z
    .boolean()
    .optional()
    .default(false)
    .describe("Attach SVG chart images (off by default for Grok compatibility)"),
});

export type AnalyzeNicheFullInput = z.infer<typeof analyzeNicheFullSchema>;

interface TrendingData {
  totalTrendingProducts: number;
  trendingProducts: Array<{ name: string; trendScore: number; signals: string[] }>;
}

interface FacebookData {
  totalAds: number;
  activeAds: number;
  scalingSignal: string;
  topCreatives?: Array<{ body: string }>;
}

interface YoutubeData {
  totalVideos: number;
  avgViews: number | null;
  topTitles: string[];
  scalingSignal: string;
}

interface SeoData {
  searchVolume: string;
  competition: string;
  seoOpportunity: string;
  relatedKeywords?: Array<{ keyword: string }>;
}

interface TiktokData {
  totalFound: number;
  topHooks: string[];
  avgLikes: number | null;
  scalingSignal: string;
}

function defaultLanguage(country: string): string {
  const map: Record<string, string> = { BR: "pt", PT: "pt", US: "en", UK: "en", ES: "es", MX: "es" };
  return map[country.toUpperCase()] ?? "en";
}

function buildChannelSnapshot(
  channels: Array<{ name: string; ok: boolean; highlight: string; ms: number }>,
): string {
  const rows = channels
    .map((c) => `| ${c.name} | ${c.ok ? "✅" : "⚠️"} | ${c.highlight} | ${c.ms}ms |`)
    .join("\n");
  return `## Coleta Paralela (1 chamada)\n\n| Canal | Status | Destaque | Tempo |\n|-------|--------|----------|-------|\n${rows}`;
}

export async function analyzeNicheFull(args: AnalyzeNicheFullInput) {
  const { niche, country = "BR", time_period = "last_30_days" } = args;
  const language = args.language ?? defaultLanguage(country);

  logger.info("Full niche analysis (orchestrated)", { niche, country, time_period });

  const started = Date.now();
  const timings: Array<{ name: string; ok: boolean; highlight: string; ms: number }> = [];

  async function runChannel<T>(
    name: string,
    fn: () => Promise<CallToolResult>,
    highlight: (data: T) => string,
  ): Promise<T | null> {
    const t0 = Date.now();
    try {
      const result = await fn();
      const data = parseToolData<T>(result);
      timings.push({ name, ok: true, highlight: highlight(data), ms: Date.now() - t0 });
      return data;
    } catch (error) {
      logger.warn(`Channel failed: ${name}`, { error: String(error) });
      timings.push({ name, ok: false, highlight: String(error), ms: Date.now() - t0 });
      return null;
    }
  }

  const [trending, facebook, youtube, seo, tiktok] = await Promise.all([
    runChannel<TrendingData>(
      "Trending",
      () => mineTrendingProducts({ niche, country, time_period }),
      (d) => `${d.totalTrendingProducts} produtos`,
    ),
    runChannel<FacebookData>(
      "Facebook",
      () => analyzeFacebookAds({ keyword: niche, country, skip_puppeteer: true }),
      (d) => `${d.activeAds} ads ativos`,
    ),
    runChannel<YoutubeData>(
      "YouTube",
      () => analyzeYoutubeTrends({ keyword: niche, country, max_results: 10 }),
      (d) => (d.avgViews ? `${Math.round(d.avgViews / 1_000_000)}M avg views` : "sem views"),
    ),
    runChannel<SeoData>(
      "SEO",
      () => analyzeGoogleSeo({ keyword: niche, country, language }),
      (d) => `vol ${d.searchVolume} / comp ${d.competition}`,
    ),
    runChannel<TiktokData>(
      "TikTok",
      () => analyzeTiktokCreatives({ keyword: niche, country }),
      (d) => `${d.totalFound} criativos`,
    ),
  ]);

  const collected_data = {
    trending_products: trending?.trendingProducts?.map((p) => ({
      name: p.name,
      score: p.trendScore,
      signals: p.signals,
    })),
    facebook_ads: facebook
      ? {
          totalAds: facebook.totalAds,
          activeAds: facebook.activeAds,
          topCreatives: facebook.topCreatives?.map((c) => c.body),
        }
      : undefined,
    youtube_trends: youtube
      ? { totalVideos: youtube.totalVideos, avgViews: youtube.avgViews ?? undefined, topTitles: youtube.topTitles }
      : undefined,
    google_seo: seo
      ? {
          searchVolume: seo.searchVolume,
          competition: seo.competition,
          relatedKeywords: seo.relatedKeywords?.map((k) => k.keyword),
        }
      : undefined,
    tiktok_creatives: tiktok
      ? { totalFound: tiktok.totalFound, topHooks: tiktok.topHooks, avgEngagement: tiktok.avgLikes ?? undefined }
      : undefined,
  };

  const input: MiningDataInput = {
    niche,
    country,
    trendingProducts: collected_data.trending_products,
    facebookAds: collected_data.facebook_ads,
    tiktokCreatives: collected_data.tiktok_creatives,
    youtubeTrends: collected_data.youtube_trends,
    googleSeo: collected_data.google_seo,
  };

  const report = synthesizeMiningReport(input);
  const dataSourcesUsed: string[] = [];
  if (collected_data.trending_products?.length) dataSourcesUsed.push("trending_products");
  if (collected_data.facebook_ads) dataSourcesUsed.push("facebook_ads");
  if (collected_data.tiktok_creatives) dataSourcesUsed.push("tiktok_creatives");
  if (collected_data.youtube_trends) dataSourcesUsed.push("youtube_trends");
  if (collected_data.google_seo) dataSourcesUsed.push("google_seo");

  const charts = buildMiningReportCharts(report, input);
  const reportMarkdown = buildMiningReportVisualMarkdown(report, input, dataSourcesUsed);
  const visualMarkdown = [buildChannelSnapshot(timings), "", reportMarkdown].join("\n");

  const result = {
    query: { niche, country, time_period, language },
    orchestration: {
      mode: "single_call_parallel",
      totalMs: Date.now() - started,
      channels: timings,
    },
    channelSummary: {
      trending: trending
        ? { count: trending.totalTrendingProducts, topPick: trending.trendingProducts[0]?.name ?? null }
        : null,
      facebook: facebook
        ? { activeAds: facebook.activeAds, totalAds: facebook.totalAds, scalingSignal: facebook.scalingSignal }
        : null,
      youtube: youtube
        ? { totalVideos: youtube.totalVideos, avgViews: youtube.avgViews, scalingSignal: youtube.scalingSignal }
        : null,
      seo: seo ? { searchVolume: seo.searchVolume, competition: seo.competition, opportunity: seo.seoOpportunity } : null,
      tiktok: tiktok ? { totalFound: tiktok.totalFound, scalingSignal: tiktok.scalingSignal } : null,
    },
    report,
    metadata: {
      productName: niche,
      country,
      dataSourcesUsed,
      generatedAt: report.generatedAt,
    },
  };

  const chartImages = args.include_charts
    ? [
        { data: svgToBase64(charts.scoreGauge), mimeType: "image/svg+xml", title: "Opportunity Score" },
        { data: svgToBase64(charts.scoreBreakdown), mimeType: "image/svg+xml", title: "Score Breakdown" },
        { data: svgToBase64(charts.channelStatus), mimeType: "image/svg+xml", title: "Channel Evidence" },
      ]
    : undefined;

  return toolRichResult(result, {
    visualMarkdown,
    images: chartImages,
    compactJson: true,
  });
}