import { z } from "zod";
import { synthesizeMiningReport, type MiningDataInput } from "../lib/report-synthesizer.js";
import { logger } from "../lib/logger.js";
import { toolSuccessResult } from "../lib/errors.js";

const trendingProductSchema = z.object({
  name: z.string(),
  score: z.number().optional(),
  signals: z.array(z.string()).optional(),
});

const facebookAdsSchema = z.object({
  totalAds: z.number().optional(),
  activeAds: z.number().optional(),
  topCreatives: z.array(z.string()).optional(),
});

const tiktokSchema = z.object({
  totalFound: z.number().optional(),
  topHooks: z.array(z.string()).optional(),
  avgEngagement: z.number().optional(),
});

const youtubeSchema = z.object({
  totalVideos: z.number().optional(),
  avgViews: z.number().optional(),
  topTitles: z.array(z.string()).optional(),
});

const seoSchema = z.object({
  searchVolume: z.string().optional(),
  competition: z.string().optional(),
  relatedKeywords: z.array(z.string()).optional(),
});

const landingPageSchema = z.object({
  triggers: z.array(z.string()).optional(),
  ctaButtons: z.array(z.string()).optional(),
  prices: z.array(z.string()).optional(),
});

const competitorSchema = z.object({
  funnelSteps: z.array(z.string()).optional(),
  pricing: z.array(z.string()).optional(),
});

export const generateMiningReportSchema = z.object({
  product_name: z.string().optional().describe("Product or offer name"),
  niche: z.string().optional().describe("Market niche"),
  country: z.string().optional().describe("Target country"),
  collected_data: z
    .object({
      trending_products: z.array(trendingProductSchema).optional(),
      facebook_ads: facebookAdsSchema.optional(),
      tiktok_creatives: tiktokSchema.optional(),
      youtube_trends: youtubeSchema.optional(),
      google_seo: seoSchema.optional(),
      landing_page: landingPageSchema.optional(),
      competitor_data: competitorSchema.optional(),
      custom_notes: z.string().optional(),
    })
    .describe("Aggregated data from other mining tools"),
});

export type GenerateMiningReportInput = z.infer<typeof generateMiningReportSchema>;

export async function generateMiningReport(args: GenerateMiningReportInput) {
  const { product_name, niche, country, collected_data } = args;
  logger.info("Generating mining report", { product_name, niche, country });

  const input: MiningDataInput = {
    productName: product_name,
    niche,
    country,
    trendingProducts: collected_data.trending_products,
    facebookAds: collected_data.facebook_ads,
    tiktokCreatives: collected_data.tiktok_creatives,
    youtubeTrends: collected_data.youtube_trends,
    googleSeo: collected_data.google_seo,
    landingPage: collected_data.landing_page,
    competitorData: collected_data.competitor_data,
    customNotes: collected_data.custom_notes,
  };

  const report = synthesizeMiningReport(input);

  const result = {
    report,
    metadata: {
      productName: product_name ?? niche ?? "unspecified",
      country: country ?? "global",
      dataSourcesUsed: countDataSources(collected_data),
      generatedAt: report.generatedAt,
    },
  };

  return toolSuccessResult(result);
}

function countDataSources(data: GenerateMiningReportInput["collected_data"]): string[] {
  const sources: string[] = [];
  if (data.trending_products?.length) sources.push("trending_products");
  if (data.facebook_ads) sources.push("facebook_ads");
  if (data.tiktok_creatives) sources.push("tiktok_creatives");
  if (data.youtube_trends) sources.push("youtube_trends");
  if (data.google_seo) sources.push("google_seo");
  if (data.landing_page) sources.push("landing_page");
  if (data.competitor_data) sources.push("competitor_data");
  return sources;
}