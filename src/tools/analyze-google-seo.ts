import { z } from "zod";
import { env } from "../config/env.js";
import { fetchJson } from "../lib/http.js";
import { buildSourceStatus, overallAvailability } from "../lib/data-availability.js";
import { isRedditApiConfigured } from "../lib/reddit-client.js";
import {
  buildSeoOpportunity,
  estimateCompetition,
  estimateSearchVolume,
  fetchGoogleAutocomplete,
  fetchGoogleTrendsBundle,
  fetchPeopleAlsoAsk,
  fetchRedditKeywordSignals,
  fetchWikipediaTrend,
  mergeRelatedKeywords,
  type RelatedKeyword,
} from "../lib/google-seo-sources.js";
import { logger } from "../lib/logger.js";
import { toolSuccessResult } from "../lib/errors.js";

export const analyzeGoogleSeoSchema = z.object({
  keyword: z.string().describe("Primary keyword to analyze"),
  country: z.string().optional().default("US").describe("Target country for SEO analysis"),
  language: z.string().optional().default("en").describe("Language code"),
});

export type AnalyzeGoogleSeoInput = z.infer<typeof analyzeGoogleSeoSchema>;

async function fetchSerpApiFallback(
  keyword: string,
  country: string,
): Promise<{
  searchVolume: string;
  competition: string;
  relatedKeywords: RelatedKeyword[];
} | null> {
  if (!env.serpApiKey) return null;

  try {
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google_trends");
    url.searchParams.set("q", keyword);
    url.searchParams.set("geo", country);
    url.searchParams.set("api_key", env.serpApiKey);

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
        type: "rising" as const,
      })),
    };
  } catch (error) {
    logger.warn("SerpAPI fallback failed", { error: String(error) });
    return null;
  }
}

export async function analyzeGoogleSeo(args: AnalyzeGoogleSeoInput) {
  const { keyword, country = "US", language = "en" } = args;
  logger.info("Analyzing Google SEO (free sources stack)", { keyword, country, language });

  const [trends, autocomplete, paa, reddit, wikipedia, serpFallback] = await Promise.all([
    fetchGoogleTrendsBundle(keyword, country),
    fetchGoogleAutocomplete(keyword),
    fetchPeopleAlsoAsk(keyword, country, language),
    fetchRedditKeywordSignals(keyword),
    fetchWikipediaTrend(keyword),
    fetchSerpApiFallback(keyword, country),
  ]);

  const relatedKeywords = mergeRelatedKeywords(trends, autocomplete.suggestions, paa.questions);
  const redditAvgScore =
    reddit.signals.length > 0
      ? Math.round(reddit.signals.reduce((sum, s) => sum + s.score, 0) / reddit.signals.length)
      : 0;

  let searchVolume = estimateSearchVolume({
    interest: trends.interest,
    risingCount: trends.risingKeywords.length,
    redditAvgScore,
    wikiDailyAverage: wikipedia.trend?.dailyAverage ?? 0,
    autocompleteCount: autocomplete.suggestions.length,
  });

  let competition = estimateCompetition({
    topCount: trends.topKeywords.length,
    risingCount: trends.risingKeywords.length,
    paaCount: paa.questions.length,
    regionalLeaders: trends.regional.filter((r) => r.score >= 70).length,
  });

  const dataSources = [
    "google_trends",
    "google_autocomplete",
    "people_also_ask",
    reddit.via === "oauth" ? "reddit_api" : "reddit_search",
    "wikipedia_pageviews",
  ];

  if (serpFallback) {
    searchVolume = serpFallback.searchVolume;
    competition = serpFallback.competition;
    dataSources.push("serpapi_fallback");
  }

  const sourceStatuses = [
    trends.status,
    autocomplete.status,
    paa.status,
    reddit.status,
    wikipedia.status,
  ];
  if (serpFallback) {
    sourceStatuses.push(buildSourceStatus("serpapi_fallback", serpFallback.relatedKeywords.length));
  }

  const dataAvailability = overallAvailability(sourceStatuses);

  const result = {
    query: { keyword, country, language },
    dataSources,
    dataAvailability,
    sources: sourceStatuses,
    apiKeysUsed: {
      serpApi: Boolean(env.serpApiKey),
      googleApi: Boolean(env.googleApiKey),
      redditApi: isRedditApiConfigured(),
      redditVia: reddit.via,
      stack: "free_multi_source",
    },
    searchVolume,
    competition,
    interestOverTime: trends.interest,
    regionalInterest: trends.regional,
    risingKeywords: trends.risingKeywords.slice(0, 10),
    topKeywords: trends.topKeywords.slice(0, 10),
    peopleAlsoAsk: paa.questions,
    redditSignals: reddit.signals.slice(0, 8),
    wikipediaTrend: wikipedia.trend,
    seoOpportunity: buildSeoOpportunity(searchVolume, competition),
    relatedKeywords: relatedKeywords.slice(0, 15),
    autocompleteSuggestions: autocomplete.suggestions,
    longTailSuggestions: relatedKeywords
      .filter((r) => r.keyword.split(" ").length >= 3)
      .slice(0, 8)
      .map((r) => r.keyword),
    recommendations: [
      trends.interest
        ? `Google Trends interest avg ${trends.interest.average}/100 (${trends.interest.momentum}) for ${country}.`
        : "Google Trends interest unavailable — rely on rising queries and Reddit demand signals.",
      paa.questions.length > 0
        ? `Answer PAA questions in content: "${paa.questions.slice(0, 2).join('", "')}"`
        : "Create FAQ content around buyer-intent questions for this keyword.",
      reddit.signals.length > 0
        ? `Reddit demand signal (${reddit.via}): avg ${redditAvgScore} upvotes across ${reddit.signals.length} relevant posts.`
        : isRedditApiConfigured()
          ? "Reddit API configured but no strong threads found for this keyword."
          : "No strong Reddit threads — set REDDIT_REFRESH_TOKEN (web app) or REDDIT_USERNAME/PASSWORD (script app).",
      trends.regional.length > 0
        ? `Top regional interest: ${trends.regional
            .slice(0, 3)
            .map((r) => `${r.region} (${r.score})`)
            .join(", ")}`
        : undefined,
      wikipedia.trend
        ? `Wikipedia views ~${wikipedia.trend.dailyAverage}/day (${wikipedia.trend.momentum}) — informational demand present.`
        : undefined,
      `Target long-tail: "${relatedKeywords[0]?.keyword ?? `${keyword} review`}" for faster ranking.`,
    ].filter(Boolean),
    analyzedAt: new Date().toISOString(),
  };

  return toolSuccessResult(result);
}