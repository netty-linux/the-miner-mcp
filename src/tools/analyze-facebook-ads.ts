import { z } from "zod";
import { env } from "../config/env.js";
import { fetchJson, fetchText } from "../lib/http.js";
import { parseFacebookAdLibraryHtml } from "../lib/facebook-ad-parser.js";
import { buildSourceStatus } from "../lib/data-availability.js";
import { logger } from "../lib/logger.js";
import { toolSuccessResult } from "../lib/errors.js";

export const analyzeFacebookAdsSchema = z.object({
  product_name: z.string().optional().describe("Product name to search in Ad Library"),
  keyword: z.string().optional().describe("Keyword to search in Facebook Ad Library"),
  country: z.string().default("US").describe("ISO country code for ad search"),
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

  try {
    const url = new URL("https://graph.facebook.com/v21.0/ads_archive");
    url.searchParams.set("access_token", token);
    url.searchParams.set("search_terms", searchTerm);
    url.searchParams.set("ad_reached_countries", country);
    url.searchParams.set("ad_active_status", "ACTIVE");
    url.searchParams.set(
      "fields",
      "id,ad_creative_bodies,page_name,ad_delivery_start_time,publisher_platforms",
    );
    url.searchParams.set("limit", "25");

    const data = await fetchJson<{
      data?: Array<{
        id: string;
        page_name?: string;
        ad_creative_bodies?: string[];
        ad_delivery_start_time?: string;
        publisher_platforms?: string[];
      }>;
    }>(url.toString());

    const ads = (data.data ?? []).map((ad) => ({
      id: ad.id,
      pageName: ad.page_name ?? "Unknown",
      adCreativeBody: (ad.ad_creative_bodies ?? []).join(" ").slice(0, 500),
      adDeliveryStartTime: ad.ad_delivery_start_time,
      platforms: ad.publisher_platforms ?? [],
      isActive: true,
    }));

    return { ads, status: buildSourceStatus("facebook_graph_api", ads.length) };
  } catch (error) {
    return { ads: [], status: buildSourceStatus("facebook_graph_api", 0, String(error)) };
  }
}

async function searchViaPublicLibrary(
  searchTerm: string,
  country: string,
): Promise<{ ads: FacebookAd[]; status: ReturnType<typeof buildSourceStatus> }> {
  try {
    const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&q=${encodeURIComponent(searchTerm)}&search_type=keyword_unordered&media_type=all`;
    const html = await fetchText(url, { browserLike: true, timeoutMs: 15_000 });
    const parsed = parseFacebookAdLibraryHtml(html);

    const ads: FacebookAd[] = parsed.map((ad) => ({
      id: ad.id,
      pageName: ad.pageName,
      adCreativeBody: ad.adCreativeBody,
      adDeliveryStartTime: ad.adDeliveryStartTime,
      platforms: ad.platforms,
      isActive: true,
    }));

    return {
      ads,
      status: buildSourceStatus(
        "facebook_ad_library",
        ads.length,
        ads.length === 0 ? "Page returned no parseable ads (may be blocked)" : undefined,
      ),
    };
  } catch (error) {
    logger.warn("Facebook Ad Library scrape failed", { error: String(error) });
    return { ads: [], status: buildSourceStatus("facebook_ad_library", 0, String(error)) };
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
    const scraped = await searchViaPublicLibrary(searchTerm, country);
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

  const scalingSignal =
    ads.length === 0
      ? "UNAVAILABLE — no ad data retrieved; set FACEBOOK_ACCESS_TOKEN"
      : activeAds.length >= 10
        ? "HIGH — many active ads suggest heavy ad spend"
        : activeAds.length >= 5
          ? "MODERATE — multiple active campaigns detected"
          : activeAds.length >= 1
            ? "LOW — few active ads"
            : "NONE — no active ads found";

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
    recommendations: [
      ads.length === 0
        ? "Set FACEBOOK_ACCESS_TOKEN for reliable Ad Library API access. Public scrape is often blocked (403)."
        : activeAds.length >= 5
          ? "Multiple active ads — strong market validation signal from real Ad Library data."
          : "Low ad volume — market may be untested or keyword too narrow.",
    ],
    analyzedAt: new Date().toISOString(),
  };

  return toolSuccessResult(result);
}