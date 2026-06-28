import { z } from "zod";
import { env } from "../config/env.js";
import { fetchText } from "../lib/http.js";
import { searchFacebookAdsArchive } from "../lib/facebook-api.js";
import { parseFacebookAdLibraryHtml } from "../lib/facebook-ad-parser.js";
import { fetchHtml } from "../lib/scraping.js";
import { buildSourceStatus } from "../lib/data-availability.js";
import { logger } from "../lib/logger.js";
import { toolRichResult } from "../lib/errors.js";
import { buildFacebookVisualMarkdown, generateBarChartSvg, svgToBase64 } from "../lib/visualizations.js";

export const analyzeFacebookAdsSchema = z.object({
  product_name: z.string().optional().describe("Product name to search in Ad Library"),
  keyword: z.string().optional().describe("Keyword to search in Facebook Ad Library"),
  country: z.string().default("US").describe("ISO country code for ad search"),
  skip_puppeteer: z
    .boolean()
    .optional()
    .default(false)
    .describe("Skip Puppeteer fallback (faster; use in orchestrated calls)"),
});

export type AnalyzeFacebookAdsInput = z.infer<typeof analyzeFacebookAdsSchema>;

interface FacebookAd {
  id: string;
  pageName: string;
  adCreativeBody: string;
  adDeliveryStartTime?: string;
  platforms: string[];
  isActive: boolean;
}

async function searchViaGraphApi(
  searchTerm: string,
  country: string,
): Promise<{ ads: FacebookAd[]; status: ReturnType<typeof buildSourceStatus> }> {
  const token = env.facebookAccessToken;
  if (!token) {
    return {
      ads: [],
      status: buildSourceStatus("facebook_graph_api", 0, undefined, "FACEBOOK_ACCESS_TOKEN not configured"),
    };
  }

  const result = await searchFacebookAdsArchive(searchTerm, country, token);
  return {
    ads: result.ads,
    status: buildSourceStatus(
      "facebook_graph_api",
      result.ads.length,
      result.error,
      result.ads.length > 0 ? "Facebook Ad Library API" : undefined,
    ),
  };
}

function mapParsedAds(parsed: ReturnType<typeof parseFacebookAdLibraryHtml>): FacebookAd[] {
  return parsed.map((ad) => ({
    id: ad.id,
    pageName: ad.pageName,
    adCreativeBody: ad.adCreativeBody,
    adDeliveryStartTime: ad.adDeliveryStartTime,
    platforms: ad.platforms,
    isActive: true,
  }));
}

async function searchViaPublicLibrary(
  searchTerm: string,
  country: string,
  skipPuppeteer = false,
): Promise<{ ads: FacebookAd[]; status: ReturnType<typeof buildSourceStatus> }> {
  const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&q=${encodeURIComponent(searchTerm)}&search_type=keyword_unordered&media_type=all`;

  try {
    const html = await fetchText(url, { browserLike: true, timeoutMs: 15_000 });
    const ads = mapParsedAds(parseFacebookAdLibraryHtml(html));
    if (ads.length > 0) {
      return {
        ads,
        status: buildSourceStatus("facebook_ad_library", ads.length, undefined, "Public Ad Library scrape"),
      };
    }
  } catch (error) {
    logger.warn("Facebook Ad Library HTTP scrape failed", { error: String(error) });
  }

  if (skipPuppeteer) {
    return {
      ads: [],
      status: buildSourceStatus(
        "facebook_ad_library",
        0,
        "HTTP scrape failed — Puppeteer skipped (fast mode)",
      ),
    };
  }

  try {
    const rendered = await fetchHtml(url, true);
    const ads = mapParsedAds(parseFacebookAdLibraryHtml(rendered.html));
    return {
      ads,
      status: buildSourceStatus(
        "facebook_ad_library_puppeteer",
        ads.length,
        ads.length === 0 ? "Ad Library page loaded but no ads parsed (Meta may be blocking datacenter IPs)" : undefined,
        ads.length > 0 ? "Puppeteer Ad Library scrape" : undefined,
      ),
    };
  } catch (error) {
    logger.warn("Facebook Ad Library puppeteer scrape failed", { error: String(error) });
    return {
      ads: [],
      status: buildSourceStatus(
        "facebook_ad_library",
        0,
        "Facebook Ad Library blocked HTTP and Puppeteer fallback",
      ),
    };
  }
}

export async function analyzeFacebookAds(args: AnalyzeFacebookAdsInput) {
  const searchTerm = args.product_name ?? args.keyword;
  if (!searchTerm) {
    throw new Error("Either product_name or keyword is required");
  }

  const country = args.country;
  logger.info("Analyzing Facebook ads", { searchTerm, country });

  let ads: FacebookAd[] = [];
  let dataSource = "unavailable";
  let sourceStatus = buildSourceStatus("facebook", 0);

  if (env.facebookAccessToken) {
    const api = await searchViaGraphApi(searchTerm, country);
    ads = api.ads;
    sourceStatus = api.status;
    dataSource = "facebook_graph_api";
  }

  if (ads.length === 0) {
    const scraped = await searchViaPublicLibrary(searchTerm, country, args.skip_puppeteer);
    if (scraped.ads.length > 0) {
      ads = scraped.ads;
      sourceStatus = scraped.status;
      dataSource = "facebook_ad_library";
    } else if (!env.facebookAccessToken) {
      sourceStatus = scraped.status;
    }
  }

  const activeAds = ads.filter((a) => a.isActive);
  const uniqueAdvertisers = [...new Set(ads.map((a) => a.pageName))];

  const apiError = sourceStatus.error;
  const scalingSignal =
    ads.length === 0
      ? env.facebookAccessToken
        ? `UNAVAILABLE — Facebook API failed${apiError ? `: ${apiError}` : ""}`
        : "UNAVAILABLE — set FACEBOOK_ACCESS_TOKEN for Ad Library API"
      : activeAds.length >= 10
        ? "HIGH — many active ads suggest heavy ad spend"
        : activeAds.length >= 5
          ? "MODERATE — multiple active campaigns detected"
          : activeAds.length >= 1
            ? "LOW — few active ads"
            : "NONE — no active ads found";

  const visualMarkdown = buildFacebookVisualMarkdown({
    searchTerm,
    country,
    totalAds: ads.length,
    activeAds: activeAds.length,
    uniqueAdvertisers: uniqueAdvertisers.length,
    scalingSignal,
    advertisers: uniqueAdvertisers.slice(0, 10),
  });

  const adsChart =
    ads.length > 0
      ? generateBarChartSvg(
          "Facebook Ads Overview",
          [
            { label: "Total", value: ads.length, color: "#3b82f6" },
            { label: "Active", value: activeAds.length, color: "#22c55e" },
            { label: "Advertisers", value: uniqueAdvertisers.length, color: "#f59e0b" },
          ],
          480,
          280,
        )
      : null;

  const result = {
    query: { searchTerm, country },
    dataSource,
    dataAvailability: ads.length > 0 ? "available" : "unavailable",
    source: sourceStatus,
    apiKeyUsed: Boolean(env.facebookAccessToken),
    totalAds: ads.length,
    activeAds: activeAds.length,
    uniqueAdvertisers: uniqueAdvertisers.length,
    scalingSignal,
    topCreatives: ads.slice(0, 5).map((a) => ({
      page: a.pageName,
      body: a.adCreativeBody,
      platforms: a.platforms,
      started: a.adDeliveryStartTime,
    })),
    advertisers: uniqueAdvertisers.slice(0, 10),
    visualSummary: { markdown: visualMarkdown },
    recommendations: [
      ads.length === 0 && apiError?.includes("verificação de identidade")
        ? "Complete a verificação de identidade em https://www.facebook.com/ads/library/api e regenere o token com ads_read."
        : ads.length === 0 && apiError?.includes("expirado")
          ? "Gere um novo FACEBOOK_ACCESS_TOKEN (long-lived) no Graph API Explorer e atualize no Railway."
          : ads.length === 0 && apiError?.includes("permissão")
            ? "No app Meta (developers.facebook.com), adicione permissão ads_read e regenere o token."
            : ads.length === 0
              ? "Verifique manualmente em https://www.facebook.com/ads/library/?country=BR — datacenter IPs costumam ser bloqueados."
              : activeAds.length >= 5
                ? "Multiple active ads — strong market validation signal from real Ad Library data."
                : "Low ad volume — market may be untested or keyword too narrow.",
    ],
    analyzedAt: new Date().toISOString(),
  };

  return toolRichResult(result, {
    visualMarkdown,
    images: adsChart
      ? [{ data: svgToBase64(adsChart), mimeType: "image/svg+xml", title: "Facebook Ads Chart" }]
      : undefined,
  });
}