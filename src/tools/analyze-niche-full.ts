import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { toolRichResult } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { parseToolData } from "../lib/tool-result.js";
import { buildStrategicIntelligence } from "../lib/intelligence-engine.js";
import { synthesizeMiningReport, type MiningDataInput } from "../lib/report-synthesizer.js";
import { buildStrategicIntelligenceMarkdown } from "../lib/strategic-visual.js";
import { buildMiningReportCharts, svgToBase64 } from "../lib/visualizations.js";
import { mineTrendingProducts } from "./mine-trending-products.js";
import { analyzeFacebookAds } from "./analyze-facebook-ads.js";
import { analyzeYoutubeTrends } from "./analyze-youtube-trends.js";
import { analyzeGoogleSeo } from "./analyze-google-seo.js";
import { analyzeTiktokCreatives } from "./analyze-tiktok-creatives.js";
import { analyzeMarketplaceDemand } from "./analyze-marketplace-demand.js";

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
  uniqueAdvertisers: number;
  scalingSignal: string;
  dataAvailability?: string;
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

interface MarketplaceData {
  combinedDemandScore: number;
  supplierAvailabilityScore: number;
  marketplaceSaturation: string;
  mercadoLivre: { totalResults: number; avgPrice: number | null; avgSold: number | null } | null;
  shopee: { totalResults: number; avgPrice: number | null; avgSold: number | null } | null;
  dataAvailability?: string;
}

function defaultLanguage(country: string): string {
  const map: Record<string, string> = { BR: "pt", PT: "pt", US: "en", UK: "en", ES: "es", MX: "es" };
  return map[country.toUpperCase()] ?? "en";
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

  const [trending, facebook, youtube, seo, tiktok, marketplace] = await Promise.all([
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
    runChannel<MarketplaceData>(
      "Marketplace",
      () => analyzeMarketplaceDemand({ keyword: niche, country }),
      (d) => `ML+Shopee demand ${d.combinedDemandScore}`,
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
    marketplace: marketplace
      ? {
          mercadoLivreTotal: marketplace.mercadoLivre?.totalResults,
          shopeeTotal: marketplace.shopee?.totalResults,
          combinedDemandScore: marketplace.combinedDemandScore,
          supplierAvailabilityScore: marketplace.supplierAvailabilityScore,
          marketplaceSaturation: marketplace.marketplaceSaturation,
          avgPrice: marketplace.mercadoLivre?.avgPrice ?? marketplace.shopee?.avgPrice ?? null,
        }
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
    marketplace: collected_data.marketplace,
  };

  const report = synthesizeMiningReport(input);

  const channelMeta = {
    trending: { ok: trending !== null, detail: trending ? `${trending.totalTrendingProducts} produtos` : timings.find((t) => t.name === "Trending")?.highlight },
    facebook: {
      ok: facebook !== null && facebook.dataAvailability !== "unavailable",
      detail: facebook?.scalingSignal,
      uniqueAdvertisers: facebook?.uniqueAdvertisers ?? 0,
    },
    youtube: { ok: youtube !== null && (youtube.totalVideos ?? 0) > 0, detail: youtube?.scalingSignal },
    seo: { ok: seo !== null, detail: seo ? `${seo.searchVolume}/${seo.competition}` : undefined },
    tiktok: { ok: tiktok !== null, detail: tiktok?.scalingSignal },
    marketplace: {
      ok: marketplace !== null && marketplace.dataAvailability !== "unavailable",
      detail: marketplace
        ? `ML ${marketplace.mercadoLivre?.totalResults ?? 0} / Shopee ${marketplace.shopee?.totalResults ?? 0}`
        : undefined,
    },
  };

  const intelligence = buildStrategicIntelligence(report, input, channelMeta);
  const visualMarkdown = buildStrategicIntelligenceMarkdown(intelligence, input);
  const charts = buildMiningReportCharts(report, input);

  const result = {
    query: { niche, country, time_period, language },
    orchestration: { mode: "single_call_parallel", totalMs: Date.now() - started, channels: timings },
    opportunityScore: intelligence.opportunityScore,
    confidenceScore: intelligence.confidence.score,
    confidenceLabel: intelligence.confidence.label,
    recommendation: intelligence.recommendation,
    intelligence: {
      dimensions: intelligence.dimensions,
      saturation: intelligence.saturation,
      gaps: intelligence.gaps,
      strategy: intelligence.strategy,
      risk: intelligence.risk,
      strengths: intelligence.strengths,
      weaknesses: intelligence.weaknesses,
      entryPlan: intelligence.entryPlan,
      scalePlan: intelligence.scalePlan,
    },
    report,
    metadata: { productName: niche, country, generatedAt: report.generatedAt },
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