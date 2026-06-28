import { z } from "zod";
import { env } from "../config/env.js";
import { fetchJson, fetchText } from "../lib/http.js";
import { buildSourceStatus } from "../lib/data-availability.js";
import { logger } from "../lib/logger.js";
import { toolSuccessResult } from "../lib/errors.js";

export const analyzeGoogleSeoSchema = z.object({
  keyword: z.string().describe("Primary keyword to analyze"),
  country: z.string().optional().default("US").describe("Target country for SEO analysis"),
  language: z.string().optional().default("en").describe("Language code"),
});

export type AnalyzeGoogleSeoInput = z.infer<typeof analyzeGoogleSeoSchema>;

interface RelatedKeyword {
  keyword: string;
  relevance: number;
}

async function fetchSerpApi(keyword: string, country: string): Promise<{
  searchVolume: string;
  competition: string;
  relatedKeywords: RelatedKeyword[];
} | null> {
  if (!env.serpApiKey) return null;

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_trends");
  url.searchParams.set("q", keyword);
  url.searchParams.set("geo", country);
  url.searchParams.set("api_key", env.serpApiKey);

  try {
    const data = await fetchJson<{
      interest_over_time?: { timeline_data?: Array<{ values?: Array<{ value: number }> }> };
      related_queries?: { rising?: Array<{ query: string; value: number }> };
    }>(url.toString());

    const timeline = data.interest_over_time?.timeline_data ?? [];
    const recentValues = timeline.slice(-4).flatMap((t) => t.values?.map((v) => v.value) ?? []);
    const avgInterest =
      recentValues.length > 0
        ? recentValues.reduce((a, b) => a + b, 0) / recentValues.length
        : 50;

    const rising = data.related_queries?.rising ?? [];

    return {
      searchVolume: avgInterest > 70 ? "high" : avgInterest > 40 ? "medium" : "low",
      competition: rising.length > 10 ? "high" : rising.length > 5 ? "medium" : "low",
      relatedKeywords: rising.slice(0, 15).map((r) => ({
        keyword: r.query,
        relevance: r.value,
      })),
    };
  } catch (error) {
    logger.warn("SerpAPI fetch failed", { error: String(error) });
    return null;
  }
}

async function fetchGoogleTrendsRelated(
  keyword: string,
  country: string,
): Promise<RelatedKeyword[]> {
  try {
    const url = `https://trends.google.com/trends/api/relatedsearches?hl=en-US&tz=360&req=${encodeURIComponent(
      JSON.stringify({
        restriction: {
          geo: { country: country },
          time: "today 3-m",
          originalTimeRangeForExploreUrl: "today 3-m",
        },
        keywordType: "QUERY",
        metric: ["TOP", "RISING"],
        trendinessSettings: { minThreshold: 0, compareTime: "today 3-m" },
        requestOptions: { property: "", backend: "IZG", category: 0 },
        language: "en",
        userConfig: { userType: "USER_TYPE_LEGIT_USER" },
        userType: "USER_TYPE_LEGIT_USER",
      }),
    )}&token=RELATED_QUERIES&tz=360`;
    const text = await fetchText(url);
    const cleaned = text.replace(/^\)\]\}',?\n?/, "");
    const data = JSON.parse(cleaned) as {
      default?: {
        rankedList?: Array<{
          rankedKeyword?: Array<{ query: string; value: number }>;
        }>;
      };
    };

    const keywords: RelatedKeyword[] = [];
    for (const list of data.default?.rankedList ?? []) {
      for (const item of list.rankedKeyword ?? []) {
        keywords.push({ keyword: item.query, relevance: item.value });
      }
    }
    return keywords.slice(0, 20);
  } catch (error) {
    logger.warn("Google Trends related searches failed", { error: String(error) });
    return [];
  }
}

async function fetchGoogleAutocomplete(keyword: string): Promise<string[]> {
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(keyword)}`;
    const text = await fetchText(url, { browserLike: true });
    const data = JSON.parse(text) as [string, string[]];
    return (data[1] ?? []).slice(0, 10);
  } catch {
    return [];
  }
}

export async function analyzeGoogleSeo(args: AnalyzeGoogleSeoInput) {
  const { keyword, country = "US", language = "en" } = args;
  logger.info("Analyzing Google SEO", { keyword, country, language });

  let searchVolume: string | null = null;
  let competition: string | null = null;
  let relatedKeywords: RelatedKeyword[] = [];
  let dataSource = "google_autocomplete";

  const serpData = await fetchSerpApi(keyword, country);
  if (serpData) {
    searchVolume = serpData.searchVolume;
    competition = serpData.competition;
    relatedKeywords = serpData.relatedKeywords;
    dataSource = "serpapi";
  } else {
    relatedKeywords = await fetchGoogleTrendsRelated(keyword, country);
    if (relatedKeywords.length > 0) {
      dataSource = "google_trends_related";
      searchVolume = relatedKeywords.length > 10 ? "high" : relatedKeywords.length > 5 ? "medium" : "low";
      competition = relatedKeywords.filter((r) => r.relevance > 80).length > 5 ? "high" : "medium";
    }
  }

  const autocompleteSuggestions = await fetchGoogleAutocomplete(keyword);
  for (const term of autocompleteSuggestions) {
    if (!relatedKeywords.find((r) => r.keyword === term)) {
      relatedKeywords.push({ keyword: term, relevance: 50 });
    }
  }

  if (searchVolume === null) {
    searchVolume = autocompleteSuggestions.length >= 8 ? "medium" : autocompleteSuggestions.length >= 3 ? "low" : "unknown";
    competition = "unknown";
  }

  const dataAvailability =
    serpData || relatedKeywords.some((r) => r.relevance > 50)
      ? autocompleteSuggestions.length > 0
        ? "available"
        : "partial"
      : autocompleteSuggestions.length > 0
        ? "partial"
        : "unavailable";

  const result = {
    query: { keyword, country, language },
    dataSource,
    dataAvailability,
    source: buildSourceStatus(dataSource, relatedKeywords.length),
    apiKeysUsed: {
      serpApi: Boolean(env.serpApiKey),
      googleApi: Boolean(env.googleApiKey),
    },
    searchVolume,
    competition,
    seoOpportunity:
      searchVolume === "unknown"
        ? "UNKNOWN — insufficient data; set SERP_API_KEY for volume estimates"
        : searchVolume === "high" && competition === "low"
          ? "EXCELLENT — high volume, low competition"
          : searchVolume === "high"
            ? "GOOD — high volume but competitive"
            : competition === "low"
              ? "MODERATE — low competition niche"
              : "CHALLENGING — needs long-tail strategy",
    relatedKeywords: relatedKeywords.slice(0, 15),
    autocompleteSuggestions,
    longTailSuggestions: relatedKeywords
      .filter((r) => r.keyword.split(" ").length >= 3)
      .slice(0, 8)
      .map((r) => r.keyword),
    recommendations: [
      !env.serpApiKey
        ? "Set SERP_API_KEY for verified search volume and competition data. Autocomplete suggestions are real but not volume metrics."
        : "Using SerpAPI for verified SEO metrics.",
      `Target long-tail: "${relatedKeywords[0]?.keyword ?? keyword + " review"}" for faster ranking.`,
      autocompleteSuggestions.length > 0
        ? `Content ideas from autocomplete: ${autocompleteSuggestions.slice(0, 3).join(", ")}`
        : "Create comparison and review content around the main keyword.",
    ],
    analyzedAt: new Date().toISOString(),
  };

  return toolSuccessResult(result);
}