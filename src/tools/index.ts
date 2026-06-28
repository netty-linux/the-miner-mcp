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
    "mine_trending_products",
    {
      title: "Mine Trending Products",
      description:
        "Discover products and offers scaling sales globally. Combines Reddit social signals and Google Trends data to identify high-momentum opportunities.",
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
        "Analyze Facebook Ad Library creatives and campaigns for a product or keyword. Detects scaling signals from active ad volume and advertiser count.",
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
        "Analyze trending TikTok ad creatives and hooks from TikTok Creative Center. Identifies viral formats and high-engagement creative patterns.",
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
        "Analyze YouTube video trends for a keyword — views, engagement, title patterns. VidiQ-style competitive intelligence for content strategy.",
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
        "Research search volume signals, related keywords, autocomplete suggestions, and organic competition for a target keyword.",
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
        "Extract and analyze landing page/checkout structure, copy, offers, psychological triggers, CTAs, and conversion elements from any URL.",
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
        "Intelligent scraping of competitor product pages, checkouts, and funnels. Supports shallow (single page) and deep (multi-step funnel) analysis.",
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
        "Synthesize collected mining data into an intelligent structured report with executive summary, metrics, scale potential analysis, recommendations, and opportunity score (0-100).",
      inputSchema: generateMiningReportSchema.shape,
    },
    async (args) =>
      safeHandler("generate_mining_report", generateMiningReportSchema, generateMiningReport as ToolHandler, args),
  );

}