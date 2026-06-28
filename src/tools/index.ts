import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import { toolErrorResult } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

import {
  mineTrendingProductsSchema,
  mineTrendingProducts,
} from "./mine-trending-products.js";
import {
  analyzeFacebookAdsSchema,
  analyzeFacebookAds,
} from "./analyze-facebook-ads.js";
import {
  analyzeTiktokCreativesSchema,
  analyzeTiktokCreatives,
} from "./analyze-tiktok-creatives.js";
import {
  analyzeYoutubeTrendsSchema,
  analyzeYoutubeTrends,
} from "./analyze-youtube-trends.js";
import {
  analyzeGoogleSeoSchema,
  analyzeGoogleSeo,
} from "./analyze-google-seo.js";
import {
  analyzeLandingPageSchema,
  analyzeLandingPage,
} from "./analyze-landing-page.js";
import {
  scrapeCompetitorDataSchema,
  scrapeCompetitorData,
} from "./scrape-competitor-data.js";
import {
  generateMiningReportSchema,
  generateMiningReport,
} from "./generate-mining-report.js";
import {
  analyzeNicheFullSchema,
  analyzeNicheFull,
} from "./analyze-niche-full.js";

type ToolHandler = (args: Record<string, unknown>) => Promise<ReturnType<typeof toolErrorResult>>;

async function safeHandler<S extends z.ZodTypeAny>(
  name: string,
  schema: S,
  handler: ToolHandler,
  args: Record<string, unknown>,
) {
  try {
    logger.info(`Tool invoked: ${name}`);
    const parsed = schema.parse(args);
    return await handler(parsed as Record<string, unknown>);
  } catch (error) {
    logger.error(`Tool failed: ${name}`, { error: String(error) });
    return toolErrorResult(error);
  }
}

/**
 * Register all mining tools on the MCP server.
 * Extension point: add new tools here following the same pattern.
 */
export function registerTools(server: McpServer): void {
  server.registerTool(
    "analyze_niche_full",
    {
      title: "Analyze Niche Full (One-Shot Report)",
      description:
        "PREFERRED for complete niche reports. Runs all channels in parallel (trending, Facebook, YouTube, SEO, TikTok) and returns a single rich visual report with charts — one MCP call instead of 6+. Use when user asks for 'relatório completo', 'full report', or niche analysis.",
      inputSchema: analyzeNicheFullSchema.shape,
    },
    async (args) =>
      safeHandler("analyze_niche_full", analyzeNicheFullSchema, analyzeNicheFull as ToolHandler, args),
  );

  server.registerTool(
    "mine_trending_products",
    {
      title: "Mine Trending Products",
      description:
        "Discover trending products via Reddit and Google Trends. Returns visual markdown, trend score chart (SVG), embed links, plus structured JSON.",
      inputSchema: mineTrendingProductsSchema.shape,
    },
    async (args) =>
      safeHandler("mine_trending_products", mineTrendingProductsSchema, mineTrendingProducts as ToolHandler, args),
  );

  server.registerTool(
    "analyze_facebook_ads",
    {
      title: "Analyze Facebook Ads",
      description:
        "Analyze Facebook Ad Library creatives and campaigns. Returns visual markdown, SVG chart, embed link to Ad Library, plus structured JSON with scaling signals.",
      inputSchema: analyzeFacebookAdsSchema.shape,
    },
    async (args) =>
      safeHandler("analyze_facebook_ads", analyzeFacebookAdsSchema, analyzeFacebookAds as ToolHandler, args),
  );

  server.registerTool(
    "analyze_tiktok_creatives",
    {
      title: "Analyze TikTok Creatives",
      description:
        "Analyze TikTok Creative Center ads and hooks. Returns visual markdown, format chart (SVG), Creative Center embed link, plus structured JSON.",
      inputSchema: analyzeTiktokCreativesSchema.shape,
    },
    async (args) =>
      safeHandler("analyze_tiktok_creatives", analyzeTiktokCreativesSchema, analyzeTiktokCreatives as ToolHandler, args),
  );

  server.registerTool(
    "analyze_youtube_trends",
    {
      title: "Analyze YouTube Trends",
      description:
        "Analyze YouTube video trends for a keyword. Returns visual markdown with top videos, Mermaid chart, SVG views chart, embed links, plus structured JSON metrics.",
      inputSchema: analyzeYoutubeTrendsSchema.shape,
    },
    async (args) =>
      safeHandler("analyze_youtube_trends", analyzeYoutubeTrendsSchema, analyzeYoutubeTrends as ToolHandler, args),
  );

  server.registerTool(
    "analyze_google_seo",
    {
      title: "Analyze Google SEO",
      description:
        "Research SEO signals from Google Trends, PAA, Reddit, Wikipedia. Returns visual markdown, opportunity gauge + regional chart (SVG), embed links, plus JSON.",
      inputSchema: analyzeGoogleSeoSchema.shape,
    },
    async (args) =>
      safeHandler("analyze_google_seo", analyzeGoogleSeoSchema, analyzeGoogleSeo as ToolHandler, args),
  );

  server.registerTool(
    "analyze_landing_page",
    {
      title: "Analyze Landing Page",
      description:
        "Analyze landing page conversion elements, triggers, CTAs, and offers. Returns visual markdown, conversion score gauge + trigger chart (SVG), plus JSON.",
      inputSchema: analyzeLandingPageSchema.shape,
    },
    async (args) =>
      safeHandler("analyze_landing_page", analyzeLandingPageSchema, analyzeLandingPage as ToolHandler, args),
  );

  server.registerTool(
    "scrape_competitor_data",
    {
      title: "Scrape Competitor Data",
      description:
        "Scrape competitor funnels and pricing. Returns visual markdown with Mermaid funnel flow, SVG funnel diagram, insights, plus structured JSON.",
      inputSchema: scrapeCompetitorDataSchema.shape,
    },
    async (args) =>
      safeHandler("scrape_competitor_data", scrapeCompetitorDataSchema, scrapeCompetitorData as ToolHandler, args),
  );

  server.registerTool(
    "generate_mining_report",
    {
      title: "Generate Mining Report",
      description:
        "Synthesize collected mining data into a rich visual report: markdown summary with Mermaid charts, SVG score/channel charts (image blocks), embed links (Ad Library, Trends, YouTube), plus structured JSON with opportunity score (0-100).",
      inputSchema: generateMiningReportSchema.shape,
    },
    async (args) =>
      safeHandler("generate_mining_report", generateMiningReportSchema, generateMiningReport as ToolHandler, args),
  );

}